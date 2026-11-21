from typing import Literal

from pydantic import BaseModel, Field


class VideosRequest(BaseModel):
    """One request for every video. Only ``prompt`` is required."""
    prompt: str = Field(min_length=3, max_length=4000)  # what the video should explain
    length: Literal["short", "long"] = "short"  # short = one video (~1-3 min); long = chapters (minutes below)
    layout: Literal["desktop", "mobile", "square"] = "desktop"  # 16:9 1920x1080 | 9:16 1080x1920 | 1:1 1080x1080
    scenes: int | None = Field(default=None, ge=2, le=20)  # short: rough number of scenes (default 6-10)
    minutes: float = Field(default=30, ge=3, le=120)  # long: the MOST it may take; the content decides (can be shorter)
    fixed_length: bool = False  # long: true = make it exactly `minutes` long
    chapters: int | None = Field(default=None, ge=2, le=24)  # long: default minutes / LONG_CHAPTER_MINUTES
    narrate: bool = True  # short: Deepgram voice (long videos are always narrated)
    captions: bool = True
    captions_mode: Literal["burn", "track", "both"] | None = None  # short: burn = in the picture, track = player switch
    scale: float = Field(default=1.0, gt=0.1, le=2.0)  # 0.5 = half resolution, quick preview
    skills: list[str] | None = None  # omitted: chosen automatically; names: use these guides
    model: str | None = None  # LLM route (default PLANNER_MODEL / DEFAULT_MODEL)
    planner: Literal["auto", "catalog", "tools"] | None = None  # how the planner reads the scene library (advanced)
