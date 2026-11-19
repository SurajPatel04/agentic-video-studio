"""Inputs, intermediate results and output of one video planning run."""
from typing_extensions import NotRequired, TypedDict

from ..schemas.lecture import Review, Script
from ..schemas.plan import Plan


class VideoInput(TypedDict):
    topic: str
    hint: str
    model: str | None
    mode: str
    skills: list[str] | None
    code_demo: str | None
    budget: int | None


class VideoOutput(TypedDict):
    plan: Plan


class VideoState(VideoInput):
    selected: NotRequired[list[str]]
    allowed: NotRequired[list[str] | None]
    route_usage: NotRequired[tuple[int, int, int]]
    script: NotRequired[Script]
    script_usage: NotRequired[tuple[int, int, int]]
    plan: NotRequired[Plan]
    review: NotRequired[Review]
    repairs: NotRequired[int]
