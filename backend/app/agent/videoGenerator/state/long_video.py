import time
from typing import Literal

from pydantic import BaseModel, Field

from ..schemas.outline import Outline


class ChapterState(BaseModel):
    n: int
    status: Literal["pending", "planned", "rendered", "failed"] = "pending"
    failed_stage: Literal["", "plan", "render"] = ""
    error: str = ""
    scenes: int = 0
    words: int = 0  # narration words actually planned
    seconds: float = 0  # length of the rendered chapter
    handoff: str = ""  # what this chapter covered, given to the next chapters
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    job_id: str = ""


class LongState(BaseModel):
    id: str
    topic: str
    minutes: float
    captions: bool = True
    scale: float = 1.0
    mode: str | None = None  # planner mode
    model: str | None = None
    skills: list[str] | None = None  # None migrates older jobs; [] explicitly disables guides
    layout: Literal["desktop", "mobile", "square"] = "desktop"  # frame size of every chapter
    max_minutes: float = 0  # the limit asked for; ``minutes`` is what the outline planned (content decides, up to the limit)
    status: Literal["outlined", "running", "planned", "done", "failed"] = "outlined"
    step: str = ""  # what it is doing / did last, for progress
    progress: float = 0  # 0..1
    error: str = ""
    outline: Outline
    chapters: list[ChapterState]
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    video: str = ""
    seconds: float = 0
    timestamps: list[str] = Field(default_factory=list)
    created: float = Field(default_factory=time.time)
    updated: float = Field(default_factory=time.time)
