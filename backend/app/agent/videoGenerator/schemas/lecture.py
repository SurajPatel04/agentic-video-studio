"""The script supplies the narration and teaching intent for every lecture scene."""

from typing import Annotated, Any

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.utils.tts import MAX_CHARS

Nonempty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Beat(BaseModel):
    narration: Nonempty = Field(max_length=MAX_CHARS)
    visual: Nonempty


class Script(BaseModel):
    beats: list[Beat] = Field(min_length=2)

    def by_id(self) -> dict[str, Beat]:
        return {f"beat-{i}": beat for i, beat in enumerate(self.beats, 1)}

    def bind(self, draft: dict[str, Any]) -> None:
        """Attach trusted narration before validating visuals or resolving word cues."""
        beats = self.by_id()
        scenes = draft.get("scenes")
        if not isinstance(scenes, list) or [s.get("id") if isinstance(s, dict) else None for s in scenes] != list(beats):
            raise ValueError(f"Use exactly these scene ids in this order: {', '.join(beats)}. Use one scene per beat.")
        for scene in scenes:
            scene["narration"] = {"text": beats[scene["id"]].narration}
            scene.pop("voice", None)  # Only TTS supplies recorded audio and word timings.


class Issue(BaseModel):
    scene_id: Nonempty
    problem: Nonempty
    replacement: Beat | None = None


class Review(BaseModel):
    issues: list[Issue]

    def describe_issues(self) -> str:
        return "\n".join(f"{issue.scene_id}: {issue.problem}" for issue in self.issues)

    @model_validator(mode="after")
    def distinct_scenes(self):
        ids = {issue.scene_id for issue in self.issues}
        if len(ids) != len(self.issues):
            raise ValueError("Combine all issues for a scene into one entry.")
        return self
