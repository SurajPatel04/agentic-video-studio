from app.agent.videoGenerator.nodes import plan_scenes as planner
from app.config import settings
from app.utils.console import step

from ..authoring import check_script, lesson_brief, lesson_reply
from ..prompts.catalog import BRIEF_GUIDANCE, WRITER
from ..schemas.lecture import Script
from ..state.video import VideoState


async def write_script(state: VideoState) -> dict:
    llm = planner.get_llm(state["model"] or settings.PLANNER_MODEL or None)
    with step("write lesson script", topic=state["topic"]) as info:
        script, calls, tin, tout = await lesson_reply(
            llm, BRIEF_GUIDANCE + "\n" + WRITER, lesson_brief(state),
            lambda data: check_script(Script.model_validate(data), state["budget"]), "lesson script",
        )
        info.update(beats=len(script.beats), llm_calls=calls, tokens_in=tin, tokens_out=tout)
    return {"script": script, "script_usage": (calls, tin, tout), "repairs": 0}
