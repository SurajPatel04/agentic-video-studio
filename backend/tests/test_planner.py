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

    def test_panel_overlay_only_on_blank_scene(self):
        term = {"type": "terminal", "lines": [{"text": "hi"}]}
        bad = spec(["TitleScene", "ExplainScene"]); bad["scenes"][1]["overlays"] = [term]
        ok = spec(["TitleScene", "BlankScene"]); ok["scenes"][1]["overlays"] = [term, {"type": "badge"}]
        self.assertIn("'s1' (ExplainScene: terminal)", planner._lint(bad))
        self.assertEqual(planner._lint(ok), "")
        self.assertIn("chat, terminal", planner._rules())

    def test_example_footers_are_blanked_unless_set(self):
        s = planner._normalize({"scenes": [{"component": "CodeScene", "props": {}},
                                           {"component": "ChartScene", "props": {"footer": "mine"}},
                                           {"component": "TitleScene", "props": {}}]})
        self.assertEqual(s["scenes"][0]["props"]["footer"], "")
        self.assertEqual(s["scenes"][1]["props"]["footer"], "mine")
        self.assertNotIn("footer", s["scenes"][2]["props"])

    def test_text_share_and_code_density(self):
        mostly_text = spec(["TitleScene", "ExplainScene", "FlowchartScene", "DefinitionScene", "ChartScene",
                            "ExplainScene", "FlowchartScene", "DefinitionScene", "SummaryScene", "QuizScene"])
        self.assertIn("4 of 10 scenes are text-only", planner._lint(mostly_text))
        one_code = spec(["TitleScene", "CodeScene", "FlowchartScene", "ExplainScene", "ChartScene",
                         "FlowchartScene", "ComparisonTableScene", "BlankScene", "SummaryScene", "QuizScene"])
        self.assertEqual(planner._lint(one_code), "")  # not a programming topic: fine
        self.assertIn("at least 2 CodeScene", planner._lint(one_code, ["teach-code"]))
        one_code["scenes"][5]["component"] = "CodeScene"
        self.assertEqual(planner._lint(one_code, ["teach-code"]), "")
        self.assertIn("30%", planner._rules())

    def test_title_with_panel_becomes_blank_scene(self):
        s = planner._normalize({"scenes": [{"component": "TitleScene", "props": {"title": "Output", "subtitle": "x"},
                                            "overlays": [{"type": "terminal"}]}]})
        self.assertEqual(s["scenes"][0]["component"], "BlankScene")
        self.assertEqual(s["scenes"][0]["props"], {"title": "Output", "titleAt": "top"})

    async def test_fewest_problems_wins_when_retries_run_out(self):
        two = spec(["TitleScene"] + ["ExplainScene", "DefinitionScene"] * 3)  # long run + text share
        two["scenes"][1]["overlays"] = [{"type": "terminal"}]
        one = spec(["TitleScene", "ExplainScene", "DefinitionScene", "ExplainScene", "DefinitionScene", "ChartScene"])
        plan, llm = await self.run_catalog([one, two])
        self.assertEqual(llm.ainvoke.call_count, 2)
        self.assertEqual(len(plan.spec["scenes"]), len(one["scenes"]))  # the earlier, better plan is kept

    def test_iso_chain_event_labels_and_repeated_layouts(self):
        def iso(i, links, label="Server B", at=(7, -7)):
            return {"id": f"s{i}", "component": "IsoScene", "props": {
                "objects": [{"id": "lb", "kind": "loadbalancer", "at": [0, 0]}, {"id": "a", "kind": "server", "at": [3.5, -3.5]},
                            {"id": "b", "kind": "server", "at": list(at), "label": label}], "links": links, "steps": []}}
        fan = [{"from": "lb", "to": "a"}, {"from": "lb", "to": "b"}]
        chained = planner._lint({"scenes": [iso(0, [{"from": "lb", "to": "a"}, {"from": "a", "to": "b"}])]})
        self.assertIn("a->b chains servers", chained)
        self.assertIn("labels name the object", planner._lint({"scenes": [iso(0, fan, label="Request 3")]}))
        same = [iso(i, fan) for i in range(3)]
        self.assertIn("s0, s1, s2 rewrite the same layout", planner._lint({"scenes": same}))
        varied = [iso(0, fan), iso(1, fan), iso(2, fan, at=(9, -4))]
        self.assertEqual(planner._lint({"scenes": varied}), "")

    def test_catalog_shows_number_limits(self):
        self.assertIn("300..", catalog.overlay_text("terminal"))


if __name__ == "__main__":
    unittest.main()
