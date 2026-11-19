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

    @model_validator(mode="after")
    def distinct_scenes(self):
        ids = {issue.scene_id for issue in self.issues}
        if len(ids) != len(self.issues):
            raise ValueError("Combine all issues for a scene into one entry.")
        return self


WRITER = """Write the spoken lesson and the evidence a viewer should see. A separate planner will design the slides.
Write in the language, scope, and format of the brief. Assume a complete beginner unless the brief names other prerequisites.
Start with a specific situation that gives the learner a reason to care. The first teaching beat pairs that situation
with a short, readable main idea. Explain unfamiliar terms at their first use, in the context of the problem.
Use a coherent example throughout when useful. Progress from the starting state through each meaningful step
to the outcome, explaining why it follows. Keep names, values, quantities, and terminology consistent with the brief
and earlier chapters. Reserve time for interpretation, and offer prediction or practice only if it helps the learner.
Speak naturally, with no stage directions or spoken glossary lists. Check the reasoning, calculations, and examples
before answering. Label invented examples as illustrative and make factual claims only to the extent supported.

Write one focused beat per intended scene, usually one to three short spoken sentences. Each visual direction
specifies what must be readable and which part changes as the speaker names it. Include the complete request and
response, actual values, or the excerpt the learner will interpret when that evidence matters. For each highlight or reveal,
specify a distinct spoken phrase that identifies the moment. Keep the example visible as its parts are explained. Use the
visual field for directions, with no scene names, component props, or animation timings. Include any requested chapter
title and bridge within the beats so the visual planner can follow them without introducing new narration.

Return only JSON in the form {"beats":[{"narration":"exact words to voice","visual":"what to show"}]}.
"""

REVIEWER = """Review these lecture scenes before voice recording. You have the original brief, script and actual scene props.
Check coverage of the requested teaching outcome, prerequisite order, factual accuracy and consistency of shared values.
Check that the visuals show the concrete example, result, and difference the narration refers to, at the spoken cue.
Follow the lesson in order and account for the contents already visible from earlier scenes. Distinguish minor wording
or style preferences from problems that materially change what a beginner learns. Report only material problems supported
by what you see, and describe an actionable fix. Assign each gap to the specific scene that should fix it. If the narration
is correct, request the visual fix and omit replacement. If the script itself needs a correction, supply replacement with
both the complete revised narration and what the corrected beat must show. Preserve the lesson language and budget.
When no material issues remain, return {"issues":[]}.
Return only JSON in the form {"issues":[{"scene_id":"beat-2","problem":"specific problem and fix",
"replacement":{"narration":"corrected spoken text","visual":"corrected visual direction"}}]}.
"""
