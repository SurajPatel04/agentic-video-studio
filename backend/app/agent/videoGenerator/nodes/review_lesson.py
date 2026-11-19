import json
from dataclasses import replace

from app.agent.videoGenerator.nodes import plan_scenes as planner
from app.config import settings
from app.utils.console import step

from ..authoring import check_script, lesson_brief, lesson_reply
from ..prompts.catalog import REVIEWER
from ..schemas.lecture import Review, Script
from ..state.video import VideoState


async def review_lesson(state: VideoState) -> dict:
    plan = state["plan"]
    beats = state["script"].by_id()

    def parse(data: dict) -> tuple[Review, Script]:
        review = Review.model_validate(data)
        if unknown := {issue.scene_id for issue in review.issues} - beats.keys():
            raise ValueError(f"Review mentions unknown scenes: {', '.join(sorted(unknown))}.")
        updated = {issue.scene_id: issue.replacement for issue in review.issues if issue.replacement}
        revised = Script(beats=[updated.get(sid, beat) for sid, beat in beats.items()])
        return review, check_script(revised, state["budget"])

    visuals = [{k: v for k, v in scene.items() if k != "narration"} for scene in plan.spec["scenes"]]
    content = {"script": {sid: beat.model_dump() for sid, beat in beats.items()}, "scenes": visuals}
    llm = planner.get_llm(state["model"] or settings.PLANNER_MODEL or None)
    with step("review lesson", topic=state["topic"]):
        (review, revised), calls, tin, tout = await lesson_reply(
            llm, REVIEWER, lesson_brief(state) + "\n\n" + json.dumps(content, ensure_ascii=False), parse, "lesson review")
    if review.issues and state["repairs"] >= 2:
        raise planner.PlanError("lesson review still found teaching issues after two repairs", review.describe_issues())
    return {"review": review, "script": revised,
            "plan": replace(plan, llm_calls=plan.llm_calls + calls, input_tokens=plan.input_tokens + tin,
                            output_tokens=plan.output_tokens + tout)}
