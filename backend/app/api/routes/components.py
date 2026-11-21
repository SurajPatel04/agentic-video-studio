import asyncio
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.agent.videoGenerator.components.staging import manifest, promote, unstage
from app.agent.videoGenerator.jobs import component_jobs
from app.agent.videoGenerator.jobs.video_jobs import QueueUnavailable
from app.api.job_files import job_file
from app.api.schemas.components import ComponentRequest
from app.api.skill_validation import check_skills


router = APIRouter()


@router.post("/components", status_code=202)
async def create_component(req: ComponentRequest) -> dict[str, Any]:
    """Queue the agent: it writes a new scene, checks it (rules, typecheck, contract, 3 rendered frames) and
    stages it, on a Celery worker. Returns at once; poll status_url (GET /components/jobs/{id}). When done it
    has ok, name, summary, report, stills ... A staged scene works in videos and the planner sees it; promote
    it to keep it for good. Cancel with POST /cancel/{id}."""
    check_skills(req.skills, "component")
    try:
        job_id = await asyncio.to_thread(component_jobs.start, req.model_dump())
    except QueueUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return await asyncio.to_thread(component_jobs.view, job_id) or {"id": job_id}


@router.get("/components/jobs/{job_id}")
async def component_job(job_id: str) -> dict[str, Any]:
    """Status of a component agent job: queued | running | done | failed | cancelled (+ result when ended)."""
    job = await asyncio.to_thread(component_jobs.view, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown component job")
    return job


@router.get("/components")
def staged_components() -> dict[str, Any]:
    """Scenes the agent made that are staged (usable, not yet promoted)."""
    return manifest()


@router.get("/components/jobs/{job_id}/{file}", response_class=FileResponse)
def component_still(job_id: str, file: str) -> FileResponse:
    if not re.fullmatch(r"still-\d+\.png", file):
        raise HTTPException(status_code=400, detail="bad file")
    return FileResponse(job_file(job_id, file), media_type="image/png")


@router.post("/components/{name}/promote")
async def promote_component(name: str) -> dict[str, str]:
    """Move a staged scene into rendering/src/scenes and registry.ts (rolled back if anything fails)."""
    try:
        path = await promote(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"promoted": name, "path": path}


@router.delete("/components/{name}")
async def delete_component(name: str) -> dict[str, str]:
    """Remove a staged scene."""
    try:
        await unstage(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"removed": name}
