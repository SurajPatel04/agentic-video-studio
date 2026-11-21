import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.agent.videoGenerator.components.component_agent import build_component
from app.agent.videoGenerator.components.staging import manifest, promote, unstage
from app.api.job_files import job_file
from app.api.schemas.components import ComponentRequest
from app.api.skill_validation import check_skills


router = APIRouter()


@router.post("/components")
async def create_component(req: ComponentRequest) -> dict[str, Any]:
    """Agent writes a new scene, checks it (rules, typecheck, contract, 3 rendered frames) and stages it.
    A staged scene works in videos and the planner sees it; promote it to keep it for good."""
    check_skills(req.skills, "component")
    r = await build_component(req.request, name=req.name, model=req.model, skills=req.skills)
    return {
        "ok": r.ok, "name": r.name, "job_id": r.job_id, "summary": r.summary, "report": r.report,
        "steps": r.steps, "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
        "files": r.files, "stills": [f"/components/jobs/{r.job_id}/{Path(p).name}" for p in r.stills],
    }


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
