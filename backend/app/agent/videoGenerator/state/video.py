"""Inputs, intermediate results and output of one video planning run."""
from typing import Any

from typing_extensions import NotRequired, TypedDict

from ..schemas.plan import Plan
from ..tools.scene_lookup import LookupCache


class VideoInput(TypedDict):
    objective: NotRequired[str]
    layout: NotRequired[str]
    scene_shortlist: NotRequired[list[str]]
    prepicked: NotRequired[dict]  # TypeSafe pre-picks: {"iso": [rows], "overlays": [names], "diagram": bool}
    lookup_cache: NotRequired[LookupCache]
    lookup_focus: NotRequired[str]
    force_format: NotRequired[str]  # format guide used whatever the router picks ("make-ad" for ads)
    topic: str
    hint: str
    model: str | None
    mode: str
    skills: list[str] | None
    code_demo: str | None


class VideoOutput(TypedDict):
    plan: Plan


class VideoState(VideoInput):
    selected: NotRequired[list[str]]
    allowed: NotRequired[list[str] | None]
    route_usage: NotRequired[tuple[int, int, int]]
    plan: NotRequired[Plan]
    # plan loop (nodes/plan_scenes.py): working memory, counters and the last step's result
    session: NotRequired[Any]  # PlanSession
    attempts: NotRequired[int]
    steps: NotRequired[int]
    outcome: NotRequired[str]
    reply: NotRequired[str | None]
