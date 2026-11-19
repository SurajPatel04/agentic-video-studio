import time
from typing import Literal

from pydantic import Field

from app.utils.llm_accounting import SavedUsage

from ..schemas.outline import Outline


class ChapterState(SavedUsage):
    n: int
    status: Literal["pending", "planned", "rendered", "failed"] = "pending"
    failed_stage: Literal["", "plan", "render"] = ""
    error: str = ""
    scenes: int = 0
    words: int = 0  # narration words actually planned
    seconds: float = 0  # length of the rendered chapter
    processing_seconds: dict[str, float] = Field(default_factory=dict)
    handoff: str = ""  # what this chapter covered, given to the next chapters
    job_id: str = ""


class LongState(SavedUsage):
    id: str
    topic: str
    minutes: float
    captions: bool = True
    scale: float = 1.0
    mode: str | None = None  # planner mode
    model: str | None = None
    objective: str = ""
    skills: list[str] | None = None  # None migrates older jobs; [] explicitly disables guides
    layout: Literal["desktop", "mobile", "square"] = "desktop"  # frame size of every chapter
    max_minutes: float = 0  # the limit asked for; ``minutes`` is what the outline planned (content decides, up to the limit)
    status: Literal["outlined", "running", "planned", "done", "failed"] = "outlined"
    step: str = ""  # what it is doing / did last, for progress
    progress: float = 0  # 0..1
    error: str = ""
    outline: Outline
    chapters: list[ChapterState]
    video: str = ""
    seconds: float = 0
    total_processing_seconds: float | None = None
    processing_seconds: dict[str, float] = Field(default_factory=dict)
    timestamps: list[str] = Field(default_factory=list)
    created: float = Field(default_factory=time.time)
    updated: float = Field(default_factory=time.time)
