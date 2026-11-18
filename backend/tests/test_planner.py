"""Planner style check: one retry for long runs of text scenes; a valid plan is never lost."""

import json
import unittest
from unittest.mock import AsyncMock, Mock, patch

from langchain_core.messages import AIMessage

from app.utils import catalog, planner, skills
from app.config import settings

settings.SKILL_ROUTER = "keyword"  # offline tests: no skill-router LLM call (tested with a mock in test_skills)


def spec(components: list[str]) -> dict:
    return {"scenes": [{"id": f"s{i}", "component": c, "props": {}} for i, c in enumerate(components)]}


TEXTY = spec(["TitleScene"] + ["ExplainScene", "DefinitionScene"] * 3)
GOOD = spec(["TitleScene", "ExplainScene", "CodeScene", "DefinitionScene", "FlowchartScene"])


class PlannerLintTests(unittest.IsolatedAsyncioTestCase):
    async def test_lectures_open_with_a_readable_concept(self):
        for heading, body in [
            ("What is a collection?", "A collection groups resources a client can request together."),
            ("What is a primary source?", "A diary records a participant’s view of an event."),
        ]:
            with self.subTest(heading=heading), patch.object(planner, "validate", AsyncMock()):
                plan = spec(["TitleScene", "ExplainScene", "StepsScene"])
                card = plan["scenes"][1]
                card.update(durationInFrames=90, props={"heading": heading, "body": body})
                checked, error = await planner._check(json.dumps(plan), lecture=True)
                self.assertFalse(error)
                card = checked["scenes"][1]
                self.assertEqual(card["props"]["textAnimation"], "none")
                self.assertGreaterEqual(card["durationInFrames"], 120)
                del plan["scenes"][1]
                checked, error = await planner._check(json.dumps(plan), lecture=True)
                self.assertIsNone(checked)
                self.assertIn("before showing its example", error)
                checked, error = await planner._check(json.dumps(plan))
                self.assertFalse(error)

    async def test_scoped_tool_repair(self):
        original = spec(["IsoScene", "TitleScene"])
        original["scenes"][0]["props"]["links"] = [{"from": "a", "to": "b", "label": "too long"}]
        original["scenes"][1]["props"]["title"] = "unrelated chapter text"
        problem = "scenes[0] (s0).props.links[0].label: shorten the label"
        repair = planner.scoped_repair(original, problem)
        path = "scenes[0].props.links[0].label"
        with self.assertRaises(ValueError):
            repair.apply({path: "OK", "scenes[1]": None})
        response = AIMessage("", tool_calls=[{"name": "update_plan_fields", "id": "edit",
                             "args": {"updates": {path: "OK"}}}])
        model = AsyncMock()
        client = Mock()
        client.bind_tools.return_value = model
        model.ainvoke.return_value = response
        result, _ = await planner._edit(repair, client, use_tool=True)
        self.assertNotIn("unrelated chapter text", model.ainvoke.call_args.args[0][1].content)
        edited = json.loads(result)
        self.assertEqual(edited["scenes"][0]["props"]["links"][0]["label"], "OK")
        self.assertEqual(original["scenes"][0]["props"]["links"][0]["label"], "too long")
        self.assertEqual(edited["scenes"][1], original["scenes"][1])

    def test_lint_counts_runs(self):
        self.assertIn("6 text-only scenes in a row", planner._lint(TEXTY))
        self.assertEqual(planner._lint(GOOD), "")

    async def run_catalog(self, replies, **kwargs):
        llm = AsyncMock()
        llm.ainvoke.side_effect = [AIMessage(json.dumps(r)) for r in replies]
        with patch("app.utils.planner.get_llm", return_value=llm), \
                patch("app.utils.planner.validate", AsyncMock()):  # every reply is "valid"
            plan = await planner._plan_catalog("topic", "", None, **kwargs)
        return plan, llm

    async def test_style_retry_then_better_plan(self):
        plan, llm = await self.run_catalog([TEXTY, GOOD])
        self.assertEqual([s["component"] for s in plan.spec["scenes"]], [s["component"] for s in GOOD["scenes"]])
        self.assertIn("text-only scenes in a row", llm.ainvoke.call_args_list[1].args[0][-1].content)

    async def test_chapter_code_requirement(self):
        conceptual = spec(["TitleScene", "FlowchartScene"])
        _, llm = await self.run_catalog([conceptual], skills=["teach-code"], code_demo="")
        self.assertEqual(llm.ainvoke.call_count, 1)

        demo = "Show the handler returning HTTP 201."
        with_code = spec(["TitleScene", "EditorScene"])
        plan, llm = await self.run_catalog([conceptual, with_code], code_demo=demo)
        self.assertIn(demo, llm.ainvoke.call_args_list[1].args[0][-1].content)
        self.assertEqual(plan.spec["scenes"][1]["component"], "EditorScene")

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

    def test_topic_must_show_its_mechanism(self):
        topic = "INNER JOIN vs LEFT JOIN"
        plan = spec(["TitleScene", "IsoScene", "FlowchartScene", "QuizScene"])
        problem = planner._lint(plan, ["teach-data"], topic)
        self.assertIn('mentions "join"', problem)
        self.assertIn("JoinScene or PipelineScene", problem)
        self.assertIn("JoinScene", planner._visual_hint(topic, ["teach-data"]))
        plan["scenes"][1]["component"] = "JoinScene"
        self.assertEqual(planner._lint(plan, ["teach-data"], topic), "")
        self.assertEqual(planner._lint(spec(["IsoScene"]), ["teach-data"], "Python list basics"), "")  # nothing required
        self.assertEqual(planner._visual_hint(topic, []), "")  # rules come only from the selected guides

    def test_text_share_and_code_density(self):
        mostly_text = spec(["TitleScene", "ExplainScene", "FlowchartScene", "DefinitionScene", "ChartScene",
                            "ExplainScene", "FlowchartScene", "DefinitionScene", "SummaryScene", "QuizScene"])
        self.assertIn("4 of 10 scenes are text-only", planner._lint(mostly_text))
        one_code = spec(["TitleScene", "CodeScene", "FlowchartScene", "ExplainScene", "ChartScene",
                         "FlowchartScene", "ComparisonTableScene", "BlankScene", "SummaryScene", "QuizScene"])
        self.assertEqual(planner._lint(one_code), "")  # not a programming topic: fine
        self.assertIn("at least 2 code scenes", planner._lint(one_code, ["teach-code"]))
        one_code["scenes"][5]["component"] = "EditorScene"  # paper videos show code in the editor
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


class KindListTests(unittest.TestCase):
    """IsoScene objects and 2D/3D devices are different lists; each scene shows the right one."""

    def test_iso_and_device_kinds_are_not_mixed(self):
        iso, dev = catalog.scene_text("IsoScene"), catalog.scene_text("DeviceGridScene")
        self.assertIn("<iso kind>", iso)
        self.assertNotIn("<device kind>", iso)
        self.assertIn("<device kind>", dev)
        self.assertIn("podcastbooth", catalog.iso_kinds())
        self.assertNotIn("podcastbooth", catalog.device_kinds())
        full = catalog.kind_legend(iso)  # no guide in the prompt: every name is listed
        self.assertTrue(full.startswith("<iso kind> = one of"))
        self.assertIn("newshub", full)
        guide = skills.guidance(["iso-diagrams"])  # the guide describes them: not repeated
        short = catalog.kind_legend(iso, known=guide)
        self.assertLess(len(short), 200)
        self.assertNotIn("podcastbooth", short)
        self.assertIn("find_iso_objects", planner.get_scene.invoke({"name": "IsoScene"}))  # tools mode searches

    def test_find_iso_objects_by_idea(self):
        top = lambda q: [k for k, _ in catalog.find_iso_objects(q)]
        self.assertIn("coins", top("money"))
        self.assertIn("ballotbox", top("election"))
        self.assertEqual(top("reporter")[0], "reporter")
        self.assertEqual(top("broadcast")[0], "tower")  # not "road" (inside the word)
        self.assertIn("ambulance", top("hospital emergency"))
        self.assertIn("pressconference", planner.find_iso_objects.invoke({"query": "press conference"}))


class DidYouMeanTests(unittest.IsolatedAsyncioTestCase):
    """The validator names the wrong value and suggests close ones instead of listing all 179."""

    async def test_kind_icon_and_component_suggestions(self):
        import shutil, tempfile
        from pathlib import Path
        from app.utils import render
        if not shutil.which("node"):
            self.skipTest("node not installed")
        spec = {"fps": 30, "width": 1920, "height": 1080, "scenes": [
            {"id": "s1", "component": "IsoScene", "durationInFrames": 90, "props": {"objects": [
                {"id": "a", "kind": "radiostudio", "label": "A", "at": [0, 0]},
                {"id": "b", "kind": "tile", "icon": "megaphon", "label": "B", "at": [3.5, -3.5]}], "links": [], "steps": []}},
            {"id": "s2", "component": "IsoScen", "durationInFrames": 90, "props": {}}]}
        d = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, d, True)
        (d / "bad.json").write_text(json.dumps(spec))
        with self.assertRaises(render.RenderError) as err:
            await render.validate(d / "bad.json")
        text = err.exception.details
        self.assertIn('unknown value "radiostudio"; did you mean "radio"', text)
        self.assertIn('unknown icon "megaphon"; did you mean "megaphone"', text)
        self.assertIn('unknown "IsoScen"; did you mean "IsoScene"', text)
        self.assertNotIn('"podcastbooth"|', text)  # the 179 allowed values are not dumped


def _iso(i, kinds=("client", "api", "database"), **props):
    objects = [{"id": f"o{j}", "kind": k, "label": k.title(), "at": [j * 3.5, -j * 3.5]} for j, k in enumerate(kinds)]
    return {"id": f"s{i}", "component": "IsoScene", "props": {"objects": objects, **props},
            "narration": {"text": f"Scene {i} shows something new number {i}."}}


class VarietyTests(unittest.TestCase):
    """Works the same for tech and non-tech plans: the suggestions come from the selected guides."""

    def test_long_run_of_one_scene_is_flagged_with_guide_alternatives(self):
        scenes = [_iso(i, kinds=("client", "api", f"k{i}")) for i in range(7)]
        tech = " ".join(planner._lint_variety(scenes, ["video-foundation", "teach-code"]))
        self.assertIn("7 IsoScenes in a row", tech)
        self.assertIn("TerminalScene", tech)
        media = " ".join(planner._lint_variety(scenes, ["video-foundation", "teach-media"]))
        self.assertIn("TimelineScene", media)
        self.assertNotIn("TerminalScene", media)

    def test_mixed_plan_passes(self):
        scenes = []
        for i in range(9):
            scenes.append(_iso(i, kinds=("client", "api", f"k{i}")) if i % 3 else
                          {"id": f"t{i}", "component": "TimelineScene", "props": {}, "narration": {"text": "x"}})
        self.assertEqual(planner._lint_variety(scenes, ["video-foundation"]), [])

    def test_one_component_filling_most_of_the_plan(self):
        scenes = []
        for i in range(10):
            scenes.append({"id": f"c{i}", "component": "ChartScene" if i in (4, 8) else "QuoteScene", "props": {},
                           "narration": {"text": "x"}})
        self.assertTrue(any("of 10 scenes are QuoteScene" in p for p in planner._lint_variety(scenes, [])))

    def test_same_picture_drawn_again_and_again(self):
        scenes = []
        for i in range(4):
            scenes += [_iso(i), {"id": f"q{i}", "component": "QuoteScene", "props": {}, "narration": {"text": "x"}}]
        problems = planner._lint_variety(scenes, [])
        self.assertTrue(any("same objects from scratch 4 times" in p for p in problems))
        scenes[2]["props"]["continue"] = True  # a continuation is the cheap, correct way to reuse it
        self.assertFalse(any("from scratch" in p for p in planner._lint_variety(scenes, [])))


class NarrationTests(unittest.TestCase):
    def test_glossary_lines_and_repeated_phrases(self):
        scenes = [{"id": f"s{i}", "narration": {"text": t}} for i, t in enumerate([
            "Resource = An identifiable thing an API exposes.",
            "The method signals what the client wants to do here.",
            "Again, the method signals what the client wants to do.",
            "So the method signals what the client wants to do now.",
            "Propaganda = persuasion aimed at a mass audience.",
        ])]
        problems = " ".join(planner._lint_narration(scenes))
        self.assertIn("s0, s4", problems)
        self.assertIn('"the method signals what the client"', problems)

    def test_teacher_style_narration_passes(self):
        scenes = [{"id": "a", "narration": {"text": "Why did your app break overnight? Let's find out."}},
                  {"id": "b", "narration": {"text": "A resource is simply a thing the API lets you reach, like one watch."}}]
        self.assertEqual(planner._lint_narration(scenes), [])


class ShowTheRealThingTests(unittest.TestCase):
    def test_topics_require_real_artifacts_in_tech_and_non_tech(self):
        names = set(catalog.scene_names())
        cases = {"REST API design and pagination": (["teach-code"], "TerminalScene"),
                 "The French Revolution in ten minutes": (["video-foundation"], "TimelineScene"),
                 "How newspapers choose a front page headline": (["video-foundation"], "FrontPageScene"),
                 "Why do things go viral on social media": (["video-foundation"], "FeedScene"),
                 "Inflation and your budget explained": (["video-foundation"], "ChartScene")}
        for topic, (guides, scene) in cases.items():
            need = skills.required_visuals(topic, guides, names)
            self.assertTrue(any(scene in s for _, s in need), (topic, need))
        self.assertEqual(skills.required_visuals("Hash map lookups", ["video-foundation"], names), [])


def _card(i):
    return {"id": f"card-{i}", "component": "IsoScene", "durationInFrames": 120,
            "props": {"title": f"Card {i}", "objects": [], "links": [], "steps": []},
            "narration": {"text": f"Card number {i} explains one idea."}}


def _broken_plan():
    """The two errors that failed a real REST chapter three times: a 2-column table with 3-cell rows,
    and a link from an object the scene never drew."""
    table = {"id": "paths-vs-ad-hoc", "component": "ComparisonTableScene", "durationInFrames": 150,
             "props": {"title": "Paths", "columns": ["Resource-oriented", "Ad hoc"],
                       "rows": [["One watch", "GET /watches/w-104", "GET /getWatch?id=w-104"]]},
             "narration": {"text": "Compare a resource path with an ad hoc route."}}
    flow = {"id": "collection-flow", "component": "IsoScene", "durationInFrames": 150,
            "props": {"title": "Next page", "objects": [{"id": "page", "kind": "file", "label": "Page", "at": [0, 0]}],
                      "links": [{"from": "watches", "to": "page"}], "steps": []},
            "narration": {"text": "The cursor asks for the next page."}}
    return {"fps": 30, "width": 1920, "height": 1080, "scenes": [_card(0), table, _card(1), flow, _card(2), _card(3),
                                                                 _card(4), _card(5)]}


class RepairContextTests(unittest.IsolatedAsyncioTestCase):
    async def test_repair_sees_what_the_field_must_match_then_escalates_to_the_whole_scene(self):
        spec = _broken_plan()
        _, problem = await planner._check(json.dumps(spec))
        self.assertIn("Each row must match the number of columns", problem)
        repair = planner._repair_for("", spec, problem)
        details = {k: d for k, (_, d) in repair.targets.items()}
        row = details["scenes[1].props.rows[0]"]["context"]
        self.assertEqual(row["columns"], ["Resource-oriented", "Ad hoc"])
        self.assertIn("exactly 2 cells", row["rule"])
        link = next(d for k, d in details.items() if k.startswith("scenes[3]"))["context"]
        self.assertEqual(link["object_ids"], ["page"])
        # the same scenes are still broken after that repair: now the whole scene, with its field list
        again = planner._repair_for("", spec, problem, repair)
        self.assertEqual(set(again.targets), {"scenes[1].props", "scenes[3].props"})
        whole = dict(again.targets["scenes[3].props"][1])
        self.assertIn("no object with id", whole["issue"])
        self.assertIn("objects", whole["context"]["fields"])
        self.assertEqual(whole["context"]["narration"], "The cursor asks for the next page.")

    async def test_salvage_replaces_only_the_stubborn_scene(self):
        spec = _broken_plan()
        spec["scenes"][3] = _card(9)  # one broken scene left
        _, problem = await planner._check(json.dumps(spec))
        fixed = await planner._salvage(json.dumps(spec), problem, None)
        self.assertEqual([s["component"] for s in fixed["scenes"]][:2], ["IsoScene", "IsoScene"])
        self.assertEqual(fixed["scenes"][1]["id"], "paths-vs-ad-hoc")
        self.assertEqual(fixed["scenes"][1]["narration"]["text"], "Compare a resource path with an ad hoc route.")
        self.assertEqual(fixed["scenes"][1]["props"]["title"], "Paths")

    async def test_salvage_refuses_when_much_of_the_plan_is_broken(self):
        spec = _broken_plan()
        spec["scenes"] = spec["scenes"][:4]  # 2 broken out of 4
        _, problem = await planner._check(json.dumps(spec))
        self.assertIsNone(await planner._salvage(json.dumps(spec), problem, None))

    async def test_whole_scene_answer_drops_the_echoed_request_labels(self):
        spec = _broken_plan()
        _, problem = await planner._check(json.dumps(spec))
        first = planner._repair_for("", spec, problem)
        whole = planner._repair_for("", spec, problem, first)
        flow = dict(spec["scenes"][3]["props"], links=[{"from": "page", "to": "page"}])
        flow["objects"] = flow["objects"] + [{"id": "watches", "kind": "database", "label": "Watches", "at": [3.5, -3.5]}]
        flow["links"] = [{"from": "watches", "to": "page"}]
        table = dict(spec["scenes"][1]["props"], rows=[["GET /watches/w-104", "GET /getWatch?id=w-104"]])
        fixed = json.loads(whole.apply({
            "scenes[1].props": {"scene": "paths-vs-ad-hoc", "component": "ComparisonTableScene", **table},
            "scenes[3].props": {"scene": "collection-flow", "component": "IsoScene", **flow}}))
        self.assertNotIn("scene", fixed["scenes"][3]["props"])
        self.assertNotIn("component", fixed["scenes"][1]["props"])
        spec_ok, problem = await planner._check(json.dumps(fixed))
        self.assertTrue(spec_ok, problem)
