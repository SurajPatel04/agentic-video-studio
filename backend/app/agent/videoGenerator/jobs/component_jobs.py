"""Component agent jobs: ``POST /components`` only queues; a Celery worker runs the agent.

The agent writes a new scene, checks it (rules, typecheck, contract, rendered frames) and stages it. That
takes minutes, so it never runs inside the API. Poll ``GET /components/jobs/{id}``; when done the status has
the same result fields the old blocking endpoint returned (ok, name, summary, report, stills ...).

Status lives in ``workspace/jobs/<id>/status.json`` (the source of truth) and is mirrored to Redis like
video jobs. Cancel with ``POST /cancel/{id}``.
"""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

from app.agent.videoGenerator.jobs import job_store
from app.agent.videoGenerator.jobs.storage import job_dir
from app.agent.videoGenerator.jobs.video_jobs import JobNotActive, QueueUnavailable, _cost, _worker_lock
from app.config import settings
from app.utils import ids
from app.utils.console import request_id
from app.utils.llm_accounting import collect_usage

log = logging.getLogger(__name__)

ENDED = ("done", "failed", "cancelled")


def _read(job_id: str) -> dict[str, Any]:
    try:
        return json.loads((job_dir(job_id) / "status.json").read_text())
    except (OSError, ValueError):
        return {}


def exists(job_id: str) -> bool:
    return ids.is_job_id(job_id) and _read(job_id).get("kind") == "component"


def _save(job_id: str, *, force: bool = False, **changes: Any) -> dict[str, Any]:
    """Merge changes into status.json. Once cancelled, the job's own later updates cannot change the status."""
    d = job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    status = _read(job_id)
    if not force and status.get("status") == "cancelled" and changes.get("status") not in (None, "cancelled"):
        changes = {k: v for k, v in changes.items() if k not in ("status", "error", "step")}
    status.update(changes, updated=time.time())
    tmp = d / "status.json.tmp"
    tmp.write_text(json.dumps(status, indent=2))
    tmp.replace(d / "status.json")  # atomic: a reader never sees half a file
    job_store.publish(job_id, status)
    return status


def start(req: dict[str, Any]) -> str:
    """Queue the agent on the Celery workers (QueueUnavailable when the queue cannot be reached)."""
    from kombu.exceptions import OperationalError

    from app.agent.videoGenerator.jobs.tasks import build_component_job

    job_id = ids.new_id()
    now = time.time()
    _save(job_id, id=job_id, kind="component", request=req["request"], name=req.get("name"), status="queued",
          step="queued", error="", created=now, queued_at=now, runner="celery", request_id=request_id.get() or None)
    try:
        build_component_job.apply_async(args=[job_id, req], task_id=job_id, retry=False)
    except OperationalError as exc:
        _save(job_id, status="failed", step="queue unavailable", error="Could not reach the job queue")
        raise QueueUnavailable("Could not reach the job queue") from exc
    return job_id


def _cancelled(job_id: str) -> bool:
    return _read(job_id).get("status") == "cancelled"


async def run_queued_component(job_id: str, req: dict[str, Any]) -> None:
    """The whole agent run in this worker process."""
    from app.agent.videoGenerator.components.component_agent import build_component

    with _worker_lock(job_dir(job_id) / ".worker.lock") as owns_job:
        if not owns_job or _read(job_id).get("status") in ENDED:
            return  # another delivery runs it, or it was cancelled while it waited
        s = _read(job_id)
        started = time.time()
        _save(job_id, status="running", step="agent writing the scene", started_at=started,
              wait_seconds=round(started - (s.get("queued_at") or started), 1), attempts=(s.get("attempts") or 0) + 1)
        try:
            with collect_usage() as usage:
                async with job_store.tracking(job_id, lambda: view(job_id), stop=lambda: _cancelled(job_id)):
                    try:
                        r = await build_component(req["request"], name=req.get("name"), model=req.get("model"),
                                                  skills=req.get("skills"), job_id=job_id)  # one folder per job
                    except asyncio.CancelledError:
                        if not _cancelled(job_id):
                            raise
                        log.info("component job %s cancelled", job_id)
                        return
                    except Exception as exc:  # the job reports the failure
                        log.exception("component job %s failed", job_id)
                        _save(job_id, status="failed", step="failed", error=f"{type(exc).__name__}: {exc}"[:2000],
                              cost_usd=_cost(usage))
                        return
                    _save(job_id, status="done" if r.ok else "failed", step="done" if r.ok else "no passing component",
                          error="" if r.ok else r.summary[:2000], cost_usd=_cost(usage), **result_fields(r))
        finally:
            ended = time.time()
            _save(job_id, finished_at=ended, run_seconds=round(ended - started, 1))


def result_fields(r) -> dict[str, Any]:
    """What the blocking POST /components used to return."""
    return {"ok": r.ok, "name": r.name, "agent_job_id": r.job_id, "summary": r.summary, "report": r.report,
            "steps": r.steps, "input_tokens": r.input_tokens, "output_tokens": r.output_tokens, "files": r.files,
            "stills": [f"/components/jobs/{r.job_id}/{Path(p).name}" for p in r.stills]}


def _worker_gone(job_id: str, updated: float) -> bool:
    if time.time() - updated < settings.JOB_HEARTBEAT_SECONDS * 6:
        return False  # just started; the first heartbeat may not be in yet
    beating = job_store.alive(job_id)
    if beating is not None:
        return not beating
    with _worker_lock(job_dir(job_id) / ".worker.lock") as free:  # no Redis: ask the file lock
        return free


def view(job_id: str) -> dict[str, Any] | None:
    if not ids.is_job_id(job_id):
        return None
    s = _read(job_id)
    if s.get("kind") != "component":
        return None
    if s.get("status") == "running" and _worker_gone(job_id, s.get("updated", 0)):
        s.update(status="failed", error=s.get("error") or "the worker stopped while the agent was running; send it again")
    return {**s, "status_url": f"/components/jobs/{job_id}"}


def cancel(job_id: str) -> dict[str, Any] | None:
    """Stop a queued or running agent job. None = unknown id; JobNotActive when it already ended."""
    v = view(job_id)
    if v is None:
        return None
    if v["status"] not in ("queued", "running"):
        raise JobNotActive(f"component job {job_id} is {v['status']}, nothing to cancel")
    _save(job_id, status="cancelled", step="cancelled", error="cancelled by request", cancelled=time.time())
    return view(job_id)
