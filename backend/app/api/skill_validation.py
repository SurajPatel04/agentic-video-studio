from fastapi import HTTPException

from app.agent.videoGenerator import skills as teaching_skills


def check_skills(names: list[str] | None, role: teaching_skills.Role = "planner") -> None:
    if names is not None:
        try:
            teaching_skills.select("", names, role=role)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
