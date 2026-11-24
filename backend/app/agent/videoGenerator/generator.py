"""Public entry point for video planning."""
from app.config import settings
from app.utils.console import step

from .ads import AD_SKILL, ad_brief
from .source import source_context
from .graph import video_graph
from .nodes.plan_scenes import Mode, recursion_limit
from .prompts.catalog import LAYOUT_HINT
from .schemas.plan import Plan
from .tools import catalog
from .tools.scene_lookup import LookupCache
from .validation import Layout


async def plan_video(topic: str, *, scenes: int | None = None, model: str | None = None, mode: Mode | None = None,
                     context: str = "", skills: list[str] | None = None, layout: Layout = "desktop",
                     code_demo: str | None = None, narration_budget: int | None = None, objective: str = "",
                     scene_shortlist: list[str] | None = None, lookup_cache: LookupCache | None = None,
                     lookup_focus: str = "", prepicked: dict | None = None, ad: bool = False,
                     minutes: float | None = None, source: str | None = None) -> Plan:
    """Ask the LLM for a valid composition about ``topic`` (printed as one step with its result).
    ``layout``: desktop 1920x1080 (default) | mobile 1080x1920 | square 1080x1080.
    ``ad``: plan an advertisement with the make-ad guide (the router still picks the rest), about
    ``minutes`` long (default AD_DEFAULT_MINUTES, at most AD_MAX_MINUTES).
    ``source``: the user's own content; the plan uses only its facts (see source.py)."""
    if ad:
        scenes, words, note = ad_brief(minutes, scenes)
        narration_budget = narration_budget or words
        context = note + context
    context += source_context(source)
    with step("plan", topic=topic, scenes=scenes, mode=mode or settings.PLANNER_MODE, layout=layout, ad=ad) as s:
        context = LAYOUT_HINT.get(layout, "") + context
        hint = f"- Make about {scenes} scenes.\n" if scenes else "- Use the number of scenes needed to teach the requested outcome. Keep a focused explanation brief.\n"
        if context:
            hint += "\n" + context.strip() + "\n"
        if narration_budget:
            hint += f"\nAim for about {narration_budget} spoken words across all scene narrations.\n"
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
            "code_demo": code_demo, "objective": objective, "layout": layout,
            "scene_shortlist": scene_shortlist or [],
            "lookup_cache": lookup_cache if lookup_cache is not None else {},
            "lookup_focus": lookup_focus,
            "prepicked": prepicked or {},
            "force_format": AD_SKILL if ad else "",
        }, config={"recursion_limit": recursion_limit() + 10})  # + the nodes around the plan loop
        plan = result["plan"]
        s.update(mode=plan.mode, skills=",".join(plan.skills), scenes=len(plan.spec.get("scenes", [])),
                 attempts=plan.attempts, llm_calls=plan.llm_calls, tokens_in=plan.input_tokens, tokens_out=plan.output_tokens)
        return plan
