"""Public entry point for video planning."""
from app.config import settings
from app.utils.console import step

from .graph import video_graph
from .nodes.plan_scenes import Layout, Mode, apply_layout
from .prompts.catalog import LAYOUT_HINT
from .schemas.plan import Plan
from .tools import catalog


async def plan_video(topic: str, *, scenes: int | None = None, model: str | None = None, mode: Mode | None = None,
                     context: str = "", skills: list[str] | None = None, layout: Layout = "desktop",
                     code_demo: str | None = None, narration_budget: int | None = None) -> Plan:
    """Ask the LLM for a valid composition about ``topic`` (printed as one step with its result).
    ``layout``: desktop 1920x1080 (default) | mobile 1080x1920 | square 1080x1080."""
    with step("plan", topic=topic, scenes=scenes, mode=mode or settings.PLANNER_MODE, layout=layout) as s:
        context = LAYOUT_HINT.get(layout, "") + context
        hint = f"- Make about {scenes} scenes.\n" if scenes else "- Make 6-10 scenes.\n"
        if context:
            hint += "\n" + context.strip() + "\n"
        # None selects the standalone policy. An empty string is a chapter with no required demo.
        if code_demo:
            hint += f"\nUse an EditorScene to demonstrate this chapter's required source code: {code_demo}\n"
        elif code_demo == "":
            hint += "\nUse code only if it directly helps teach this chapter's goal.\n"
        mode = mode or settings.PLANNER_MODE
        if mode == "auto":
            mode = "tools" if len(catalog.scene_names()) > settings.PLANNER_TOOLS_THRESHOLD else "catalog"
        result = await video_graph.ainvoke({
            "topic": topic, "hint": hint, "model": model, "mode": mode, "skills": skills,
            "code_demo": code_demo, "budget": narration_budget,
        })
        plan = result["plan"]
        apply_layout(plan.spec, layout)
        s.update(mode=plan.mode, skills=",".join(plan.skills), scenes=len(plan.spec.get("scenes", [])),
                 attempts=plan.attempts, llm_calls=plan.llm_calls, tokens_in=plan.input_tokens, tokens_out=plan.output_tokens)
        return plan
