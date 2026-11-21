import asyncio
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.agent.videoGenerator.jobs import video_jobs
from app.api.job_files import CAPTIONS_MEDIA, TRANSCRIPT_MEDIA
from app.api.schemas.videos import VideosRequest
from app.api.skill_validation import check_skills
from app.config import settings
from app.utils import ids


router = APIRouter()


@router.post("/videos", status_code=202)
async def create_video(req: VideosRequest) -> dict[str, Any]:
    """Start a video and return at once. Poll GET /videos/{id} until "status" is "done", then download
    /videos/{id}/video. Same request and status for short and long videos; only "length" changes."""
    check_skills(req.skills)
    data = req.model_dump()
    start = video_jobs.start_long if req.length == "long" else video_jobs.start_short
    try:
        job_id = await asyncio.to_thread(start, data) if settings.VIDEO_JOB_RUNNER == "celery" else start(data)
    except video_jobs.QueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return await asyncio.to_thread(video_jobs.view, job_id) or {"id": job_id}  # reads files + Redis


@router.get("/videos")
def list_videos(limit: int = 50) -> list[dict[str, Any]]:
    """Newest first, short and long together."""
    return video_jobs.list_jobs(limit)


def _video_job(job_id: str) -> dict[str, Any]:
    if not ids.is_job_id(job_id) or not (v := video_jobs.view(job_id)):
        raise HTTPException(status_code=404, detail="unknown video id")
    return v


@router.get("/videos/{job_id}")
def get_video(job_id: str) -> dict[str, Any]:
    """status: queued | running | done | failed | cancelled (POST /cancel/{id}) | paused (a long video that stopped).
    step = what it is doing now, progress = 0..1, progress_percent = display percentage (e.g. "45%"), error when failed; the file URLs appear when done."""
    return _video_job(job_id)


@router.get("/videos/{job_id}/log")
def get_video_log(job_id: str, limit: int = 200) -> dict[str, Any]:
    """Celery jobs: the newest log lines from Redis (status changes with progress, and the worker's log
    records for this job). Kept JOB_TTL_SECONDS after the last line."""
    v = _video_job(job_id)
    found = video_jobs.job_store.lines(job_id, min(max(limit, 1), settings.JOB_LOG_MAX))
    if found is None:
        raise HTTPException(status_code=503, detail="job log needs the celery runner and a reachable JOB_REDIS_URL")
    return {"id": job_id, "status": v["status"], "progress": v["progress"],
            "progress_percent": v["progress_percent"], "lines": found}


def _video_file(job_id: str, name: str) -> Path:
    v = _video_job(job_id)
    if v["status"] != "done":
        raise HTTPException(status_code=409, detail=f"video not ready (status: {v['status']}, step: {v.get('step', '')})")
    path = video_jobs.file(job_id, name)
    if not path:
        raise HTTPException(status_code=404, detail=f"{name} not found (no narration?)")
    return path


@router.get("/videos/{job_id}/video", response_class=FileResponse)
def get_video_file(job_id: str) -> FileResponse:
    return FileResponse(_video_file(job_id, "video.mp4"), media_type="video/mp4", filename=f"{job_id}.mp4")


@router.get("/videos/{job_id}/transcript", response_class=FileResponse)
def get_video_transcript(job_id: str, format: Literal["json", "txt"] = "txt") -> FileResponse:
    return FileResponse(_video_file(job_id, f"transcript.{format}"), media_type=TRANSCRIPT_MEDIA[format],
                        filename=f"{job_id}-transcript.{format}")


@router.get("/videos/{job_id}/captions", response_class=FileResponse)
def get_video_captions(job_id: str, format: Literal["vtt", "srt"] = "srt") -> FileResponse:
    return FileResponse(_video_file(job_id, f"captions.{format}"), media_type=CAPTIONS_MEDIA[format], filename=f"{job_id}.{format}")
