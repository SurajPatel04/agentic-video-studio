"""One API for every video: ``POST /videos`` with ``length`` short | long and ``layout`` desktop | mobile | square.

Both lengths return at once with an id; ``GET /videos/{id}`` reports status / step / progress, and the files
are served from ``/videos/{id}/video|transcript|captions``.

The API never makes a video itself: every job is queued on Celery and a worker process does the whole job
(skills, plan, voice, render). The API only writes the queued status and reads status files.

- short (one render, about 1-3 min): status in ``workspace/jobs/<id>/status.json`` (same folder as the render)
- long (chapters, 10-120 min): the outline, chapter checkpoints and final render also live in ``workspace/jobs/<id>/``.
"""

import asyncio
import fcntl
import json
import logging
import os
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Any

from app.agent.videoGenerator.jobs import job_store, long_video
from app.agent.videoGenerator.generator import plan_video
from app.config import settings
from .scene_stream import streaming_video
from .audio_cleanup import remove_audio
from .storage import job_dir
from app.utils import ids
from app.utils.console import request_id
from app.utils.llm_accounting import CollectedUsage, collect_usage
from app.utils.render import render_video

log = logging.getLogger(__name__)

# Run facts kept in status.json (and Redis): who asked, queue wait, run time, tries.
RUN_FIELDS = ("request_id", "runner", "queued_at", "started_at", "finished_at", "wait_seconds", "run_seconds", "attempts",
              "cancelled")


# --------------------------------------------------------------------------- short


class QueueUnavailable(RuntimeError):
    """The worker queue could not accept the request."""


class JobNotActive(RuntimeError):
    """The job is not queued or running (already done, failed, cancelled or paused)."""


def _save(job_id: str, *, force: bool = False, **changes: Any) -> dict[str, Any]:
    """Merge changes into status.json. Once cancelled, the job's own later updates cannot change the status
    back (only a new queue/resume, or force=True)."""
    d = job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    path = d / "status.json"
    status = json.loads(path.read_text()) if path.exists() else {}
    if not force and status.get("status") == "cancelled" and changes.get("status") not in (None, "queued", "cancelled"):
        changes = {k: v for k, v in changes.items() if k not in ("status", "error", "step")}
    status.update(changes, updated=time.time())
    tmp = d / "status.json.tmp"
    tmp.write_text(json.dumps(status, indent=2))
    tmp.replace(path)  # atomic: a reader never sees half a file
    job_store.publish(job_id, {**status, "progress_percent": progress_percent(status.get("progress", 0.0))})
    return status


def render_threads(renders_per_job: int = 1) -> int | None:
    """Remotion threads for one render. Celery: this machine's cores split between the jobs running on it now
    (Redis heartbeats; a lone job gets all of them), at least RENDER_MIN_THREADS. Without Redis it assumes all
    CELERY_WORKERS are busy. Local runner: None = Remotion's default."""
    if settings.VIDEO_JOB_RUNNER != "celery":
        return None
    cores = os.cpu_count() or 2
    active = job_store.active_here()
    jobs = max(1, active) if active is not None else settings.CELERY_WORKERS
    return min(cores, max(settings.RENDER_MIN_THREADS, cores // (jobs * max(1, renders_per_job))))


def _enqueue(job_id: str, req: dict[str, Any], length: str) -> None:
    from kombu.exceptions import OperationalError

    from app.agent.videoGenerator.jobs.tasks import generate_video

    now = time.time()
    _save(job_id, id=job_id, length=length, layout=req["layout"], prompt=req["prompt"], status="queued",
          step="queued", progress=0.0, error="", created=_created(job_id, now), queued_at=now, runner="celery",
          request_id=request_id.get() or None, started_at=None, finished_at=None, wait_seconds=None, run_seconds=None)
    try:
        generate_video.apply_async(args=[job_id, req, length], task_id=job_id, retry=False)
    except OperationalError as exc:
        _save(job_id, status="failed", step="queue unavailable", error="Could not reach the video queue")
        raise QueueUnavailable("Could not reach the video queue") from exc


def _created(job_id: str, now: float) -> float:
    """Keep the first creation time when a long video is queued again (resume)."""
    try:
        return json.loads((job_dir(job_id) / "status.json").read_text()).get("created") or now
    except (OSError, ValueError):
        return now


@asynccontextmanager
async def _run_clock(job_id: str):
    """Saves started_at, wait_seconds (time in the queue), attempts (1 + redeliveries / resumes), then
    finished_at and run_seconds however the run ends (done, failed, cancelled)."""
    s = json.loads((job_dir(job_id) / "status.json").read_text())
    started = time.time()
    waited = started - (s.get("queued_at") or s.get("created") or started)
    _save(job_id, started_at=started, wait_seconds=round(waited, 1), attempts=(s.get("attempts") or 0) + 1,
          finished_at=None, run_seconds=None)
    try:
        yield
    finally:
        ended = time.time()
        _save(job_id, finished_at=ended, run_seconds=round(ended - started, 1))


def _cost(usage: CollectedUsage) -> float | None:
    """USD for the LLM calls, when every call had a price (LLM_PRICING_USD_PER_MTOK or the gateway's)."""
    d = usage.details
    if d.usage_details_calls and d.priced_llm_calls == d.usage_details_calls:
        return round(d.known_llm_cost_usd, 6)
    return None


@contextmanager
def _worker_lock(path: Path):
    with path.open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
        else:
            yield True


async def run_queued_video(job_id: str, req: dict[str, Any], length: str) -> None:
    """The whole video in this worker process: skills, plan, voice, render (long: every chapter)."""
    directory = job_dir(job_id)
    with _worker_lock(directory / ".worker.lock") as owns_job:
        if not owns_job:
            return
        launch = json.loads((directory / "status.json").read_text())
        if launch["status"] in {"done", "failed", "cancelled"}:
            return  # cancelled while it waited in the queue
        try:
            async with _run_clock(job_id), job_store.tracking(job_id, lambda: view(job_id), stop=lambda: _cancelled(job_id)):
                await _run_queued(job_id, req, length, directory)
        except asyncio.CancelledError:
            if not _cancelled(job_id):
                raise
            log.info("video %s cancelled", job_id)  # subprocesses (Remotion, ffmpeg) were killed on the way out


def _cancelled(job_id: str) -> bool:
    try:
        return json.loads((job_dir(job_id) / "status.json").read_text()).get("status") == "cancelled"
    except (OSError, ValueError):
        return False


def cancel(job_id: str) -> dict[str, Any] | None:
    """Stop a queued or running video job.

    Queued: the worker skips it. Running: the worker sees the cancel mark within JOB_HEARTBEAT_SECONDS and
    stops (render and ffmpeg processes are killed). Finished chapters of a long video stay saved.
    None = unknown id; JobNotActive when it is not queued or running."""
    v = view(job_id)
    if v is None:
        return None
    if v["status"] not in ("queued", "running"):
        raise JobNotActive(f"video {job_id} is {v['status']}, nothing to cancel")
    _save(job_id, length=v["length"], status="cancelled", step="cancelled", error="cancelled by request", cancelled=time.time())
    return view(job_id)


def reopen(job_id: str) -> None:
    """Before resuming a cancelled long video in this server: clear the cancel mark."""
    if _cancelled(job_id):
        _save(job_id, force=True, status="paused", step="resuming", error="")


async def _run_queued(job_id: str, req: dict[str, Any], length: str, directory: Path) -> None:
    if length == "short":
        await _run_short(job_id, req, propagate=True)
        return
    try:
        if not (directory / "state.json").exists():
            _save(job_id, status="running", step="writing the outline", progress=0.02)
            await _create_outline(job_id, req)
        render = req.get("render", True)
        _save(job_id, status="running", step="planning and rendering chapters" if render else "planning chapters")
        state = await long_video.run_long_video(job_id, render=render)
        want = "done" if render else "planned"
        if state.status != want:
            raise RuntimeError(state.error or f"Video ended with status {state.status}")
        _save(job_id, status=want, step=state.step, progress=state.progress)
    except Exception as exc:
        _save(job_id, status="failed", error=f"{type(exc).__name__}: {exc}"[:2000])
        raise


async def _run_short(job_id: str, req: dict[str, Any], *, propagate: bool = False) -> None:
    with collect_usage() as usage:
        try:
            await _make_short(job_id, req, usage)
        except Exception as exc:  # the job reports the failure
            log.exception("short video %s failed", job_id)
            _save(job_id, status="failed", error=f"{type(exc).__name__}: {exc}"[:2000],
                  details=str(getattr(exc, "details", ""))[-3000:], cost_usd=_cost(usage))
            if propagate:
                raise


async def _make_short(job_id: str, req: dict[str, Any], usage: CollectedUsage) -> None:
    _save(job_id, status="running", step="planning scenes", progress=0.1)
    threads = render_threads()
    async with streaming_video(layout=req["layout"], scale=req.get("scale", 1.0), captions=req.get("captions", True),
                               captions_mode=req.get("captions_mode"), narrate=req.get("narrate", True),
                               concurrency=threads) as stream:
        plan = await plan_video(req["prompt"], scenes=req.get("scenes"), model=req.get("model"), mode=req.get("planner"),
                                skills=req.get("skills"), layout=req["layout"], ad=bool(req.get("ad")),
                                minutes=req.get("minutes") if req.get("ad") else None, source=req.get("source"))
        if stream:
            await stream.finish()
        _save(job_id, step="voice, captions and render", progress=0.45, skills=plan.skills, scenes=len(plan.spec.get("scenes", [])),
              llm_calls=plan.llm_calls, input_tokens=plan.input_tokens, output_tokens=plan.output_tokens, cost_usd=_cost(usage))
        result = await render_video(plan.spec, narrate=req.get("narrate", True), captions=req.get("captions", True),
                                    captions_mode=req.get("captions_mode"), scale=req.get("scale", 1.0), job_id=job_id,
                                    concurrency=threads)
    _save(job_id, status="done", step="done", progress=1.0, seconds=round(result.seconds, 1), video=str(result.video),
          cost_usd=_cost(usage))
    await asyncio.to_thread(remove_audio, job_dir(job_id))  # the MP4 has the audio now


def start_short(req: dict[str, Any]) -> str:
    """Queue a short video on the Celery workers (QueueUnavailable when the queue cannot be reached)."""
    job_id = ids.new_id()
    _enqueue(job_id, req, "short")
    return job_id


# ---------------------------------------------------------------------------- long


async def _create_outline(job_id: str, req: dict[str, Any]) -> None:
    await long_video.create_long_video(req["prompt"], req["minutes"], chapters=req.get("chapters"), captions=req.get("captions", True),
                                       scale=req.get("scale", 1.0), mode=req.get("planner"), model=req.get("model"),
                                       skills=req.get("skills"), layout=req["layout"], job_id=job_id,
                                       fixed_length=req.get("fixed_length", False), source=req.get("source"))


def queue_long_run(job_id: str, *, render: bool = True) -> bool:
    """Celery: start or resume an outlined long video on a worker (finished chapters are skipped).
    False when it is already waiting in the queue or running."""
    state = long_video.load(job_id)  # ValueError if unknown
    current = view(job_id) or {}
    if current.get("status") in ("queued", "running"):
        return False
    _enqueue(job_id, {"prompt": state.topic, "layout": state.layout, "render": render}, "long")
    return True


def start_long(req: dict[str, Any]) -> str:
    """Queue a long video on the Celery workers; the worker writes the outline, then every chapter."""
    job_id = long_video.new_id()
    _enqueue(job_id, req, "long")
    return job_id


# ---------------------------------------------------------------------------- view


def _urls(job_id: str, done: bool) -> dict[str, Any]:
    base = f"/videos/{job_id}"
    return {"status_url": base, "video_url": f"{base}/video" if done else None,
            "transcript_url": f"{base}/transcript?format=txt" if done else None,
            "captions_url": f"{base}/captions?format=srt" if done else None}


def _worker_gone(job_id: str, updated: float) -> bool:
    """A celery job marked running whose worker stopped heartbeating (killed, out of memory, machine down)."""
    if time.time() - updated < settings.JOB_HEARTBEAT_SECONDS * 6:
        return False  # just started; the first heartbeat may not be in yet
    beating = job_store.alive(job_id)
    if beating is not None:
        return not beating
    with _worker_lock(job_dir(job_id) / ".worker.lock") as free:  # no Redis: ask the file lock
        return free


def progress_percent(fraction: float) -> str:
    return f"{fraction * 100:.1f}".removesuffix(".0") + "%"


def view(job_id: str) -> dict[str, Any] | None:
    job = _job_status(job_id)
    if job is not None:
        job["progress_percent"] = progress_percent(job["progress"])
    return job


def _job_status(job_id: str) -> dict[str, Any] | None:
    """The same shape for both lengths: status = queued | running | done | failed | cancelled (| paused for
    a long job that stopped)."""
    if not ids.is_job_id(job_id):
        return None
    directory = job_dir(job_id)
    launch = directory / "status.json"
    queued = json.loads(launch.read_text()) if launch.exists() else {}
    if queued.get("kind") == "component":
        return None
    has_outline = (directory / "state.json").exists()
    if not has_outline and queued.get("length") != "long":
        if not queued.get("status"):
            video = directory / "video.mp4"
            if not video.exists():
                return None
            composition = directory / "composition.json"
            spec = json.loads(composition.read_text()) if composition.exists() else {}
            layout = {(1080, 1920): "mobile", (1080, 1080): "square"}.get((spec.get("width"), spec.get("height")), "desktop")
            created = video.stat().st_mtime
            return {"id": job_id, "length": "short", "layout": layout, "prompt": "", "status": "done", "step": "done",
                    "progress": 1.0, "error": "", "created": created, "updated": created, **_urls(job_id, True)}
        s = queued
        if s.get("runner") != "celery" and s.get("status") in ("queued", "running"):  # made inside an older API process
            s.update(status="failed", error=s.get("error") or "the server stopped while this video was being made; send it again")
        elif s.get("runner") == "celery" and s.get("status") == "running" and _worker_gone(job_id, s.get("updated", 0)):
            s.update(status="failed", error=s.get("error") or "the worker stopped while this video was being made; send it again")
        s.pop("video", None)
        return {**s, **_urls(job_id, s.get("status") == "done")}
    if not has_outline:
        return {**queued, **_urls(job_id, False)}
    st = long_video.load(job_id)
    running = long_video.is_running(job_id)
    if queued.get("status") == "running" and not running:
        beating = job_store.alive(job_id)
        if beating is not None:
            running = beating
        elif (directory / ".worker.lock").exists():  # no Redis: ask the worker's file lock
            with _worker_lock(directory / ".worker.lock") as free:
                running = not free
    if st.status == "done":
        status = "done"
    elif queued.get("status") == "cancelled":
        status = "cancelled"
    elif running:
        status = "running"
    elif queued.get("status") == "queued" and time.time() - queued.get("updated", 0) < settings.CELERY_VISIBILITY_TIMEOUT:
        status = "queued"  # waiting for a free worker
    elif st.status == "failed" or (queued.get("status") == "failed" and st.status == "running"):
        status = "failed"
    else:
        status = "paused"
    return {"id": st.id, "length": "long", "layout": st.layout, "prompt": st.topic, "status": status, "step": st.step,
            "progress": round(st.progress, 3), "error": st.error or (queued.get("error", "") if status == "failed" else ""), "minutes": st.minutes, "max_minutes": st.max_minutes or st.minutes, "chapters": len(st.chapters),
            "seconds": st.seconds, "timestamps": st.timestamps, "skills": st.skills, "llm_calls": st.llm_calls,
            "input_tokens": st.input_tokens, "output_tokens": st.output_tokens, "cost_usd": st.total_llm_cost_usd,
            "created": queued.get("created") or st.created, "updated": st.updated,
            **{k: queued.get(k) for k in RUN_FIELDS if k in queued}, **_urls(job_id, status == "done")}


def file(job_id: str, name: str) -> Path | None:
    """video.mp4 / transcript.* / captions.* of a finished job, or None."""
    v = view(job_id)
    if not v or v["status"] != "done":
        return None
    if v["length"] == "short":
        path = job_dir(job_id) / name
        return path if path.exists() else None
    if name == "video.mp4":
        path = Path(long_video.load(job_id).video)
        return path if path.is_file() else None
    path = long_video.transcript_files(job_id).get(name)
    return path if path and path.exists() else None


def list_jobs(limit: int = 50) -> list[dict[str, Any]]:
    root = settings.WORKSPACE_DIR / "jobs"
    job_ids = [p.parent.name for p in root.glob("*/status.json")]
    job_ids += [p.parent.name for p in root.glob("*/state.json")]
    views = [v for v in (view(i) for i in dict.fromkeys(job_ids)) if v]
    views.sort(key=lambda v: v.get("created", 0), reverse=True)
    keep = ("id", "length", "layout", "prompt", "status", "step", "progress", "progress_percent", "created")
    return [{k: v.get(k) for k in keep} for v in views[:limit]]
