"""Planner style check: one retry for long runs of text scenes; a valid plan is never lost."""

import json
import unittest
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage

from app.utils import catalog, planner


def spec(components: list[str]) -> dict:
    return {"scenes": [{"id": f"s{i}", "component": c, "props": {}} for i, c in enumerate(components)]}


TEXTY = spec(["TitleScene"] + ["ExplainScene", "DefinitionScene"] * 3)
GOOD = spec(["TitleScene", "ExplainScene", "CodeScene", "DefinitionScene", "FlowchartScene"])


class PlannerLintTests(unittest.IsolatedAsyncioTestCase):
    def test_lint_counts_runs(self):
        self.assertIn("6 text-only scenes in a row", planner._lint(TEXTY))
        self.assertEqual(planner._lint(GOOD), "")

    async def run_catalog(self, replies):
        llm = AsyncMock()
        llm.ainvoke.side_effect = [AIMessage(json.dumps(r)) for r in replies]
        with patch("app.utils.planner.get_llm", return_value=llm), \
                patch("app.utils.planner.validate", AsyncMock()):  # every reply is "valid"
            plan = await planner._plan_catalog("topic", "", None)
        return plan, llm

    async def test_style_retry_then_better_plan(self):
        plan, llm = await self.run_catalog([TEXTY, GOOD])
        self.assertEqual([s["component"] for s in plan.spec["scenes"]], [s["component"] for s in GOOD["scenes"]])
        self.assertIn("text-only scenes in a row", llm.ainvoke.call_args_list[1].args[0][-1].content)

    async def test_only_one_style_retry_and_valid_plan_kept(self):
        plan, llm = await self.run_catalog([TEXTY, TEXTY])
        self.assertEqual(llm.ainvoke.call_count, 2)  # second texty plan accepted, no third call
        self.assertEqual(len(plan.spec["scenes"]), len(TEXTY["scenes"]))

    def test_catalog_shows_number_limits(self):
        self.assertIn("300..", catalog.overlay_text("terminal"))


if __name__ == "__main__":
    unittest.main()
