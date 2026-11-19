from pydantic import BaseModel, Field


class Term(BaseModel):
    term: str
    meaning: str


class ChapterOutline(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    goal: str = Field(min_length=5)  # intended viewer outcome for this chapter
    key_points: list[str] = Field(min_length=1, max_length=8)
    code_demo: str = ""  # required source-code demonstration, empty when optional
    minutes: float = Field(gt=0, le=20)
    words: int = 0  # narration budget, set by us from minutes


class Outline(BaseModel):
    title: str
    audience: str = "beginners"
    style: str = ""  # visual conventions every chapter follows
    glossary: list[Term] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)  # running examples reused across chapters
    chapters: list[ChapterOutline] = Field(min_length=1, max_length=24)
