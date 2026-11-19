import logging
from dataclasses import replace

from app.agent.videoGenerator.tools import catalog
from app.agent.videoGenerator.nodes import plan_scenes as planner
from app.agent.videoGenerator.tools.plan_repair import Repair
from app.config import settings

from ..schemas.lecture import Review, Script
from ..state.video import VideoState

log = logging.getLogger(__name__)


def _lesson_repair(spec: dict, script: Script, review: Review) -> Repair:
    issues = {issue.scene_id: issue for issue in review.issues}
    beats = script.by_id()
    targets = {}
    for i, scene in enumerate(spec["scenes"]):
        sid = scene["id"]
        if sid not in issues:
            continue
        beat, issue = beats[sid], issues[sid]
        component = scene["component"]
        names = [name for name, _, _ in catalog.search_scenes(issue.problem + " " + beat.visual, limit=3)]
        contracts = [catalog.scene_text(name) for name in dict.fromkeys([component, *names])]
        targets[f"scenes[{i}]"] = (["scenes", i], {
            "scene": sid, "component": component, "current": scene, "issue": issue.problem,
            "context": {"narration": beat.narration, "visual_direction": beat.visual, "fields": contracts,
                        "rule": "Return the complete corrected scene with the same id. Keep its transition and other correct "
                                "visual details. Use exact phrases of the supplied narration for cues. Narration is inserted by the pipeline."},
        })
    return Repair(spec, targets)


async def repair_scenes(state: VideoState) -> dict:
    plan, script, review = state["plan"], state["script"], state["review"]
    repair = _lesson_repair(plan.spec, script, review)
    llm = planner.get_llm(state["model"] or settings.PLANNER_MODEL or None)
    log.info("lesson.review repairing scenes=%s", sorted(issue.scene_id for issue in review.issues))
    problem = ""
    for _ in range(min(2, settings.PLANNER_MAX_ATTEMPTS)):
        reply, (tin, tout) = await planner._edit(repair, llm)
        plan = replace(plan, llm_calls=plan.llm_calls + 1, input_tokens=plan.input_tokens + tin,
                       output_tokens=plan.output_tokens + tout)
        if reply is None:
            problem = "Use exactly the requested scene paths and provide a complete scene at each path."
        else:
            checked, problem = await planner._check(reply, state["code_demo"], lecture=True, script=script)
            if checked is not None:
                return {"plan": replace(plan, spec=checked), "repairs": state["repairs"] + 1}
        for _, details in repair.targets.values():
            details["context"]["validation_feedback"] = problem[:3000]
    raise planner.PlanError("could not repair the scenes flagged by lesson review", review.describe_issues() + "\n" + problem)
