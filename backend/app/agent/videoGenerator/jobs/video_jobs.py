"""One API for every video: ``POST /videos`` with ``length`` short | long and ``layout`` desktop | mobile | square.

Both lengths return at once with an id; ``GET /videos/{id}`` reports status / step / progress, and the files
are served from ``/videos/{id}/video|transcript|captions``.

- short (one render, about 1-3 min): planned and rendered in the background; its status is saved in
  ``workspace/jobs/<id>/status.json`` (12-hex id, same folder as the render)
- long (chapters, 10-120 min): the long-video pipeline (``workspace/long/<id>/``, 10-hex id). The id is
  made first, so the job can be polled while the outline is still being written.
"""

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

from app.agent.videoGenerator.jobs import long_video
from app.agent.videoGenerator.generator import plan_video
from app.config import settings
from app.utils.render import render_video

log = logging.getLogger(__name__)

_tasks: dict[str, asyncio.Task] = {}
_starting: dict[str, dict[str, Any]] = {}  # long jobs whose outline is still being written (no state yet)


# --------------------------------------------------------------------------- short


def _short_dir(job_id: str) -> Path:
    return settings.WORKSPACE_DIR / "jobs" / job_id


def _save(job_id: str, **changes: Any) -> dict[str, Any]:
    d = _short_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    path = d / "status.json"
    status = json.loads(path.read_text()) if path.exists() else {}
    status.update(changes, updated=time.time())
    tmp = d / "status.json.tmp"
    tmp.write_text(json.dumps(status, indent=2))
    tmp.replace(path)  # atomic: a reader never sees half a file
    return status


async def _run_short(job_id: str, req: dict[str, Any]) -> None:
    try:
        _save(job_id, status="running", step="planning scenes", progress=0.1)
        plan = await plan_video(req["prompt"], scenes=req.get("scenes"), model=req.get("model"), mode=req.get("planner"),
                                skills=req.get("skills"), layout=req["layout"])
        _save(job_id, step="voice, captions and render", progress=0.45, skills=plan.skills, scenes=len(plan.spec.get("scenes", [])),
              llm_calls=plan.llm_calls, input_tokens=plan.input_tokens, output_tokens=plan.output_tokens)
        result = await render_video(plan.spec, narrate=req.get("narrate", True), captions=req.get("captions", True),
                                    captions_mode=req.get("captions_mode"), scale=req.get("scale", 1.0), job_id=job_id)
        _save(job_id, status="done", step="done", progress=1.0, seconds=round(result.seconds, 1), video=str(result.video))
    except Exception as exc:  # the job reports the failure; the server keeps running
        log.exception("short video %s failed", job_id)
        _save(job_id, status="failed", error=f"{type(exc).__name__}: {exc}"[:2000],
              details=str(getattr(exc, "details", ""))[-3000:])


def start_short(req: dict[str, Any]) -> str:
    job_id = uuid.uuid4().hex[:12]
    _save(job_id, id=job_id, length="short", layout=req["layout"], prompt=req["prompt"], status="queued", step="queued",
          progress=0.0, error="", created=time.time())
    _tasks[job_id] = asyncio.get_running_loop().create_task(_run_short(job_id, req))
    return job_id


# ---------------------------------------------------------------------------- long


async def _run_long(job_id: str, req: dict[str, Any]) -> None:
    try:
        await long_video.create_long_video(req["prompt"], req["minutes"], chapters=req.get("chapters"), captions=req.get("captions", True),
                                           scale=req.get("scale", 1.0), mode=req.get("planner"), model=req.get("model"),
                                           skills=req.get("skills"), layout=req["layout"], job_id=job_id,
                                           fixed_length=req.get("fixed_length", False))
        _starting.pop(job_id, None)
        long_video.start(job_id, render=True)
    except Exception as exc:
        log.exception("long video %s failed while writing the outline", job_id)
        _starting[job_id].update(status="failed", error=f"{type(exc).__name__}: {exc}"[:2000], updated=time.time())


def start_long(req: dict[str, Any]) -> str:
    job_id = long_video.new_id()
    _starting[job_id] = {"id": job_id, "length": "long", "layout": req["layout"], "prompt": req["prompt"], "status": "running",
                         "step": "writing the outline", "progress": 0.02, "error": "", "created": time.time(), "updated": time.time()}
    _tasks[job_id] = asyncio.get_running_loop().create_task(_run_long(job_id, req))
    return job_id


# ---------------------------------------------------------------------------- view


def _urls(job_id: str, done: bool) -> dict[str, Any]:
    base = f"/videos/{job_id}"
    return {"status_url": base, "video_url": f"{base}/video" if done else None,
            "transcript_url": f"{base}/transcript?format=txt" if done else None,
            "captions_url": f"{base}/captions?format=srt" if done else None}


def kind(job_id: str) -> str | None:
    """"long" | "short" | None (unknown id)."""
    if job_id in _starting or (long_video.ID_RE.fullmatch(job_id) and (settings.WORKSPACE_DIR / "long" / job_id / "state.json").exists()):
        return "long"
    d = _short_dir(job_id)
    if len(job_id) == 12 and ((d / "status.json").exists() or (d / "video.mp4").exists()):
        return "short"  # made here, or a finished /render, /video or CLI job
    return None


def progress_percent(fraction: float) -> str:
    return f"{fraction * 100:.1f}".removesuffix(".0") + "%"


def view(job_id: str) -> dict[str, Any] | None:
    job = _job_status(job_id)
    if job is not None:
        job["progress_percent"] = progress_percent(job["progress"])
    return job


def _job_status(job_id: str) -> dict[str, Any] | None:
    """The same shape for both lengths: status = queued | running | done | failed (| paused for a long job
    that stopped and can be resumed with POST /long/{id}/run)."""
    k = kind(job_id)
    if k is None:
        return None
    if k == "short":
        d = _short_dir(job_id)
        if not (d / "status.json").exists():  # older job: finished when its MP4 exists
            spec = json.loads((d / "composition.json").read_text()) if (d / "composition.json").exists() else {}
            layout = {(1080, 1920): "mobile", (1080, 1080): "square"}.get((spec.get("width"), spec.get("height")), "desktop")
            created = (d / "video.mp4").stat().st_mtime
            return {"id": job_id, "length": "short", "layout": layout, "prompt": "", "status": "done", "step": "done",
                    "progress": 1.0, "error": "", "created": created, "updated": created, **_urls(job_id, True)}
        s = json.loads((d / "status.json").read_text())
        if s.get("status") in ("queued", "running") and not (job_id in _tasks and not _tasks[job_id].done()):
            s.update(status="failed", error=s.get("error") or "the server stopped while this video was being made; send it again")
        s.pop("video", None)
        return {**s, **_urls(job_id, s.get("status") == "done")}
    if job_id in _starting:
        s = dict(_starting[job_id])
        return {**s, **_urls(job_id, False)}
    st = long_video.load(job_id)
    running = long_video.is_running(job_id)
    status = "done" if st.status == "done" else "failed" if st.status == "failed" else "running" if running else "paused"
    return {"id": st.id, "length": "long", "layout": st.layout, "prompt": st.topic, "status": status, "step": st.step,
            "progress": round(st.progress, 3), "error": st.error, "minutes": st.minutes, "max_minutes": st.max_minutes or st.minutes, "chapters": len(st.chapters),
            "seconds": st.seconds, "timestamps": st.timestamps, "skills": st.skills, "llm_calls": st.llm_calls,
            "input_tokens": st.input_tokens, "output_tokens": st.output_tokens, "created": st.created, "updated": st.updated,
            **_urls(job_id, status == "done")}


def file(job_id: str, name: str) -> Path | None:
    """video.mp4 / transcript.* / captions.* of a finished job, or None."""
    v = view(job_id)
    if not v or v["status"] != "done":
        return None
    if v["length"] == "short":
        path = _short_dir(job_id) / name
        return path if path.exists() else None
    if name == "video.mp4":
        return Path(long_video.load(job_id).video)
    path = long_video.transcript_files(job_id).get(name)
    return path if path and path.exists() else None


def list_jobs(limit: int = 50) -> list[dict[str, Any]]:
    ids = [p.parent.name for p in (settings.WORKSPACE_DIR / "jobs").glob("*/status.json")]
    ids += [p.parent.name for p in (settings.WORKSPACE_DIR / "long").glob("*/state.json")] + list(_starting)
    views = [v for v in (view(i) for i in dict.fromkeys(ids)) if v]
    views.sort(key=lambda v: v.get("created", 0), reverse=True)
    keep = ("id", "length", "layout", "prompt", "status", "step", "progress", "progress_percent", "created")
    return [{k: v.get(k) for k in keep} for v in views[:limit]]
