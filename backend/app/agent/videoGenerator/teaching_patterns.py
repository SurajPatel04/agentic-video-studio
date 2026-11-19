"""Editable teaching guidance shared by routing, writing and scene planning."""
import re
from pathlib import Path

import yaml

with Path(__file__).with_name("prompts").joinpath("teaching_patterns.yml").open(encoding="utf-8") as stream:
    _patterns = yaml.safe_load(stream)

OBJECTIVES = _patterns["objectives"]
PREDICTION_PAUSE_SECONDS = _patterns["prediction_pause_seconds"]
EDUCATIONAL_FORMATS = {"teach-lecture", "make-explainer"}


def objective_for(topic: str, skills: list[str], proposed: object = None) -> str:
    if not EDUCATIONAL_FORMATS.intersection(skills):
        return ""
    if isinstance(proposed, str) and proposed in OBJECTIVES:
        return proposed
    text = topic.casefold().strip()
    for objective, cues in (
        ("compare", r"\b(compare|contrast|versus|vs\.?|differences? between)\b"),
        ("operate", r"^(how (?:do i|to)|show me how to|send|create|configure|install|use|build)\b"),
        ("interpret", r"^(interpret|analy[sz]e|evaluate)\b"),
        ("trace", r"^(trace|walk through|(?:explain )?how)\b"),
    ):
        if re.search(cues, text):
            return objective
    return "recognize"


def pattern_hint(objective: str) -> str:
    if objective not in OBJECTIVES:
        return ""
    pattern = OBJECTIVES[objective]
    beats = "\n".join(f"- {beat}" for beat in pattern["beats"])
    return (
        f"\nLearning objective ({objective}): {pattern['purpose']}\n"
        f"Suggested teaching beats:\n{beats}\n"
        f"Suggested scenes: {', '.join(pattern['scenes'])}. Use other catalog scenes when they fit the evidence.\n"
        "Combine, reorder, or skip suggested beats as the brief requires. Scale depth to the requested duration "
        "and audience. Add a pitfall, contrast, or deeper mechanism only when it advances the objective. "
        "Use source code when the learner needs to read or write it. Show the tool the brief requests. "
        "When teaching from a URL, show the complete URL once before shortening "
        "it to the path.\n"
        "When a prediction helps, ask it in a separate scene before the answer. Keep the example visible "
        f"and set narration.pauseAfterSeconds to {PREDICTION_PAUSE_SECONDS:g} on the question scene.\n"
    )
