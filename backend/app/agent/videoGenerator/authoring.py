"""Script validation and structured model calls shared by the writer and reviewer."""
from collections.abc import Callable
from typing import TypeVar

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent.videoGenerator import validation
from app.agent.videoGenerator.nodes import plan_scenes as planner
from app.config import settings
from app.utils.llm import text_of, usage_of

from .schemas.lecture import Script
from .state.video import VideoState

LessonReply = TypeVar("LessonReply")


def lesson_brief(state: VideoState) -> str:
    return f"Topic: {state['topic']}\n{state['hint']}"


async def lesson_reply(llm, system: str, brief: str, parse: Callable[[dict], LessonReply],
                        stage: str) -> tuple[LessonReply, int, int, int]:
    messages = [SystemMessage(system), HumanMessage(brief)]
    tin = tout = 0
    problem = ""
    for attempt in range(1, settings.PLANNER_MAX_ATTEMPTS + 1):
        msg = await llm.ainvoke(messages)
        i, o = usage_of(msg)
        tin, tout = tin + i, tout + o
        reply = text_of(msg)
        try:
            return parse(planner._extract_json(reply)), attempt, tin, tout
        except ValueError as exc:
            problem = str(exc)[:2000]
            messages = [*messages[:2], AIMessage(reply), HumanMessage(f"{problem}\nReturn corrected JSON only.")]
    raise planner.PlanError(f"{stage} failed validation", problem)


def check_script(script: Script, budget: int | None) -> Script:
    if budget:
        words = sum(len(beat.narration.split()) for beat in script.beats)
        if abs(words - budget) / budget > settings.LONG_BUDGET_TOLERANCE:
            raise ValueError(f"The narration has {words} words. Adjust the script to about {budget} words.")
    lines = [{"id": sid, "narration": {"text": beat.narration}} for sid, beat in script.by_id().items()]
    if problems := validation._lint_narration(lines):
        raise ValueError("\n".join(problems))
    return script
