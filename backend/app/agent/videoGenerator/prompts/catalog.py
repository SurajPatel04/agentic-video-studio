"""Named, version-controlled prompts for the video generator."""
from functools import cache
from pathlib import Path

import yaml


@cache
def _prompts(family: str) -> dict[str, str]:
    path = Path(__file__).with_name(f"{family}.yml")
    with path.open(encoding="utf-8") as stream:
        values = yaml.safe_load(stream)
    if not isinstance(values, dict) or not all(
        isinstance(key, str) and isinstance(value, str) for key, value in values.items()
    ):
        raise ValueError(f"{path} must contain a string-to-string mapping")
    return values


BRIEF_GUIDANCE = _prompts("planner")["brief_guidance"]
RULES = _prompts("planner")["rules"]
CATALOG_OUTPUT = _prompts("planner")["catalog_output"]
TOOLS_INTRO = _prompts("planner")["tools_intro"]
LAYOUT_HINT = {layout: _prompts("planner")[f"layout_{layout}"] for layout in ("mobile", "square")}

OUTLINE_RULES = _prompts("outline")["outline_rules"]
PROMPT = _prompts("skill_router")["prompt"]
REPAIR_SYSTEM = _prompts("repair")["repair_system"]
