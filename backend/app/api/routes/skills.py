from typing import Any, Literal

from fastapi import APIRouter

from app.agent.videoGenerator import skills as teaching_skills


router = APIRouter()


@router.get("/skills")
def list_teaching_skills(role: Literal["planner", "component"] = "planner") -> list[dict[str, Any]]:
    return [s.model_dump() for s in teaching_skills.discover(role).values()]
