"""Job status, progress and logs mirrored to Redis (Celery runner), each key with a TTL.

Keys (JOB_REDIS_URL, every key expires JOB_TTL_SECONDS after its last write):
- ``video:job:<id>``        JSON snapshot: status, step, progress, progress_percent, worker, tokens ...
- ``video:job:<id>:log``    list of JSON lines, newest last, at most JOB_LOG_MAX: status changes and
                            the worker's log records for this job
- ``video:job:<id>:alive``  the worker's hostname while it runs the job (expires 3 heartbeats after the last)
- ``video:jobs``            sorted set of job ids by creation time, for listing; entries older than the TTL
                            are dropped

The snapshot also has request_id, queued_at / started_at / finished_at, wait_seconds, run_seconds,
attempts and cost_usd. LLM prompts and replies are not sent to Redis (JOB_LOG_PROMPTS=true to send them).

The files in workspace/ stay the source of truth; Redis is for dashboards, other services and logs.
Redis being down never fails a job: writes are skipped (and retried after a pause).
"""

import asyncio
import json
import logging
import re
import socket
import time
from contextlib import asynccontextmanager
from typing import Any, Callable

from app.config import settings

log = logging.getLogger(__name__)

ANSI = re.compile(r"\x1b\[[0-9;]*m")  # console colours
INDEX = "video:jobs"  # sorted set: job id -> created time (newest last), trimmed to the TTL

_client = None
_down_until = 0.0  # after a failed call, skip Redis for a while instead of waiting on every write
DOWN_PAUSE = 30.0


def enabled() -> bool:
    return settings.VIDEO_JOB_RUNNER == "celery" and bool(settings.JOB_REDIS_URL)


def _redis():
    global _client
    if _client is None:
        import redis

        _client = redis.Redis.from_url(settings.JOB_REDIS_URL, decode_responses=True,
                                       socket_timeout=2, socket_connect_timeout=2)
    return _client


def _call(fn: Callable[[Any], Any], default: Any = None) -> Any:
    global _down_until
    if not enabled() or time.monotonic() < _down_until:
        return default
    try:
        return fn(_redis())
    except Exception as exc:  # noqa: BLE001 - Redis is optional for a job
        _down_until = time.monotonic() + DOWN_PAUSE
        log.warning("job redis unavailable (%s); skipping for %.0fs", type(exc).__name__, DOWN_PAUSE)
        return default


def key(job_id: str, part: str = "") -> str:
    return f"video:job:{job_id}" + (f":{part}" if part else "")


def _line(kind: str, **fields: Any) -> str:
    return json.dumps({"t": round(time.time(), 3), "kind": kind, **fields}, default=str)


def _push(r, job_id: str, *lines: str) -> None:
    ttl = settings.JOB_TTL_SECONDS
    p = r.pipeline(transaction=False)
    p.rpush(key(job_id, "log"), *lines)
    p.ltrim(key(job_id, "log"), -settings.JOB_LOG_MAX, -1)
    p.expire(key(job_id, "log"), ttl)
    p.execute()


def publish(job_id: str, snapshot: dict[str, Any]) -> None:
    """Save the snapshot; add a log line when status / step / whole percent changed."""
    def write(r):
        k = key(job_id)
        previous = json.loads(r.get(k) or "{}")
        data = {**previous, **snapshot, "id": job_id}
        r.set(k, json.dumps(data, default=str), ex=settings.JOB_TTL_SECONDS)
        if not previous:  # first write: add to the index of jobs, drop index entries older than the TTL
            now = time.time()
            p = r.pipeline(transaction=False)
            p.zadd(INDEX, {job_id: data.get("created") or now})
            p.zremrangebyscore(INDEX, "-inf", now - settings.JOB_TTL_SECONDS)
            p.expire(INDEX, settings.JOB_TTL_SECONDS)
            p.execute()
        changed = [f for f in ("status", "step", "error") if data.get(f) != previous.get(f)]
        if int(data.get("progress", 0) * 100) != int(previous.get("progress", 0) * 100):
            changed.append("progress")
        if changed:
            _push(r, job_id, _line("status", status=data.get("status"), step=data.get("step"),
                                   progress=data.get("progress"), error=data.get("error") or None))
    _call(write)


def heartbeat(job_id: str) -> None:
    ttl = max(1, int(settings.JOB_HEARTBEAT_SECONDS * 3))
    _call(lambda r: r.set(key(job_id, "alive"), socket.gethostname(), ex=ttl))


def alive(job_id: str) -> bool | None:
    """True while a worker heartbeats this job; None when Redis is not used or not reachable."""
    return _call(lambda r: bool(r.exists(key(job_id, "alive"))))


def get(job_id: str) -> dict[str, Any] | None:
    raw = _call(lambda r: r.get(key(job_id)))
    return json.loads(raw) if raw else None


def lines(job_id: str, limit: int = 200) -> list[dict[str, Any]] | None:
    """Newest ``limit`` log lines (oldest first); None when Redis is not used or not reachable."""
    raw = _call(lambda r: r.lrange(key(job_id, "log"), -max(1, limit), -1))
    return None if raw is None else [json.loads(x) for x in raw]


def recent(limit: int = 50) -> list[str] | None:
    """Ids of the newest jobs still kept in Redis (newest first); None when Redis is not used or not reachable."""
    return _call(lambda r: r.zrevrange(INDEX, 0, max(1, limit) - 1))


class _JobLogHandler(logging.Handler):
    """Sends this process's log records to the job's Redis log (a worker runs one job at a time)."""

    def __init__(self, job_id: str):
        super().__init__(logging.INFO)
        self.job_id = job_id

    def emit(self, record: logging.LogRecord) -> None:
        if record.name == __name__:
            return  # never log about logging to Redis into Redis
        if record.name == "app.llm" and record.levelno < logging.WARNING and not settings.JOB_LOG_PROMPTS:
            return  # prompts, replies and per-call lines stay in the worker's console (size, privacy)
        try:
            text = ANSI.sub("", record.getMessage())[: settings.JOB_LOG_MAX_CHARS]
            line = _line("log", level=record.levelname, logger=record.name, message=text)
        except Exception:  # noqa: BLE001
            return
        _call(lambda r: _push(r, self.job_id, line))


@asynccontextmanager
async def tracking(job_id: str, snapshot: Callable[[], dict[str, Any] | None],
                   stop: Callable[[], bool] = lambda: False):
    """While the worker runs the job, every JOB_HEARTBEAT_SECONDS: check ``stop()`` (cancel request) and
    cancel the job's task when it is true; with Redis also heartbeat + snapshot, and send logs to Redis."""
    redis_on = enabled()
    worker = socket.gethostname()
    job_task = asyncio.current_task()
    handler = _JobLogHandler(job_id)
    root = logging.getLogger("app")
    if redis_on:
        root.addHandler(handler)

    def beat() -> bool:
        if stop():
            return True
        if redis_on:
            heartbeat(job_id)
            if (s := snapshot()) is not None:
                publish(job_id, {**s, "worker": worker})
        return False

    async def loop() -> None:
        while True:
            if await asyncio.to_thread(beat):
                logging.getLogger("app.jobs").warning("job %s: cancel requested, stopping", job_id)  # also into the Redis log
                job_task.cancel()
                return
            await asyncio.sleep(settings.JOB_HEARTBEAT_SECONDS)

    task = asyncio.create_task(loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        if redis_on:
            root.removeHandler(handler)
            if (s := snapshot()) is not None:
                publish(job_id, {**s, "worker": worker})
            _call(lambda r: r.delete(key(job_id, "alive")))
