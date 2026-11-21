import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from app.agent.videoGenerator.jobs import component_jobs, video_jobs
from app.middleware.request_log import cancel_request
from app.utils import ids


router = APIRouter()


@router.post("/cancel/{id}")
async def cancel(id: str) -> dict[str, Any]:
    """Cancel by id, whatever it is:

    - a video job (POST /videos) or component agent job (POST /components): queued jobs are skipped and
      running jobs stop on their Celery worker within JOB_HEARTBEAT_SECONDS. The status becomes
      "cancelled" and any finished chapters stay saved.
    - any request still running on this server, by its X-Request-ID. Send a UUID4 in that header to
      cancel the request, which then returns 499.

    404 = nothing with this id; 409 = the job already ended (done / failed / cancelled / paused)."""
    if ids.is_job_id(id):
        try:
            if component_jobs.exists(id):
                job, kind = await asyncio.to_thread(component_jobs.cancel, id), "component"
            else:
                job, kind = await asyncio.to_thread(video_jobs.cancel, id), "video"
        except video_jobs.JobNotActive as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        if job is not None:
            return {"id": id, "kind": kind, "status": job["status"], "job": job}
    if ids.REQUEST_ID_RE.fullmatch(id) and cancel_request(id):
        return {"id": id, "kind": "request", "status": "cancelled"}
    raise HTTPException(status_code=404, detail=f"no running job or request with id {id}")
