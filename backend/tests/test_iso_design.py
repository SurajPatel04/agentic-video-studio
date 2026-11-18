import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage
from app.utils import iso_design

CUP = {"aliases": ["coffee", "mug"], "parts": [
    {"shape": "cylinder", "at": [5, 5, 0], "radius": 4.6, "height": 0.5, "color": "cream"},
    {"shape": "box", "at": [4.6, 1.3, 1.6], "size": [0.8, 1.2, 2.2], "color": "peach"},
    {"shape": "cylinder", "at": [5, 5, 0.5], "radius": 2.8, "height": 4, "color": "peach"},
    {"shape": "cylinder", "at": [5, 5, 4.4], "radius": 2.3, "height": 0.15, "color": "ink"}]}


def reply(payload):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return AIMessage(text, usage_metadata={"input_tokens": 50, "output_tokens": 80, "total_tokens": 130})


def plan_with(*objects):
    return SimpleNamespace(spec={"scenes": [{"component": "IsoScene", "props": {"objects": list(objects)}}]},
                           input_tokens=0, output_tokens=0, llm_calls=0)


class DesignTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        patcher = patch.object(iso_design, "ROOT", Path(self.dir.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.dir.cleanup)
        self.designer = AsyncMock()
        llm = patch.object(iso_design, "get_llm", return_value=self.designer)
        llm.start()
        self.addCleanup(llm.stop)

    async def test_draws_from_shapes_publishes_and_reuses_by_alias(self):
        self.designer.ainvoke.return_value = reply(CUP)
        objects = [{"kind": "tile", "design": "coffee-cup"}, {"kind": "tile", "design": "mug"}]
        plan = plan_with(*objects)
        await iso_design.materialize(plan, None)
        self.assertEqual(objects[0], objects[1])
        faces = objects[0]["faces"]
        self.assertGreaterEqual(len(faces), 6)
        self.assertTrue(any(f["shade"] > 0.3 for f in faces))  # lit tops, like built-in objects
        saved = json.loads((Path(self.dir.name) / "coffee-cup.json").read_text())
        self.assertEqual(saved["parts"], CUP["parts"])  # the source shapes are kept with the faces
        self.assertTrue((Path(self.dir.name) / "coffee-cup.svg").exists())
        await iso_design.materialize(plan_with({"kind": "tile", "design": "coffee"}), None)
        self.designer.ainvoke.assert_awaited_once()
        self.assertEqual((plan.llm_calls, plan.input_tokens, plan.output_tokens), (1, 50, 80))
        sent = json.loads(self.designer.ainvoke.await_args.args[0][1].content)
        self.assertEqual(set(sent), {"concept", "label"})  # never the lesson title

    async def test_builtin_kind_or_icon_wins_without_calling_the_designer(self):
        objects = [{"kind": "tile", "design": "pizza"}, {"kind": "tile", "design": "credit-card", "icon": "box"},
                   {"kind": "tile", "design": "food-delivery-bike"}]
        await iso_design.materialize(plan_with(*objects), None)
        self.assertEqual(objects, [{"kind": "tile", "icon": "pizza"}, {"kind": "creditcard"},
                                   {"kind": "tile", "icon": "bike"}])
        self.designer.ainvoke.assert_not_awaited()

    async def test_designer_can_answer_with_an_icon_and_it_is_remembered(self):
        self.designer.ainvoke.side_effect = [reply({"icon": "lnk"}), reply({"icon": "link"})]
        obj = {"kind": "tile", "design": "resource-locator"}
        await iso_design.materialize(plan_with(obj), None)
        self.assertEqual(obj, {"kind": "tile", "icon": "link"})
        retry = self.designer.ainvoke.await_args_list[1].args[0][-1].content
        self.assertIn('did you mean link', retry.replace('"', ""))
        again = {"kind": "tile", "design": "resource-locator"}
        await iso_design.materialize(plan_with(again), None)
        self.assertEqual(again["icon"], "link")
        self.assertEqual(self.designer.ainvoke.await_count, 2)
        self.assertNotIn("resource-locator", iso_design.planner_hint())  # icon answers are not designs

    async def test_aliases_stay_unique(self):
        self.designer.ainvoke.side_effect = [reply(CUP), reply({**CUP, "aliases": ["mug", "teacup"]})]
        await iso_design.materialize(plan_with({"kind": "tile", "design": "coffee-cup"},
                                               {"kind": "tile", "design": "tea-cup"}), None)
        saved = json.loads((Path(self.dir.name) / "tea-cup.json").read_text())
        self.assertEqual(saved["aliases"], ["teacup"])

    async def test_failed_design_falls_back_to_plain_tile(self):
        self.designer.ainvoke.return_value = reply("not json")
        objects = [{"kind": "tile", "icon": "box", "design": "brand-new-thing"},
                   {"kind": "tile", "design": "brand-new-thing"}, {"kind": "tile", "design": "Bad ID!"}]
        with self.assertLogs(iso_design.log, "WARNING"):
            await iso_design.materialize(plan_with(*objects), None)
        self.assertEqual(objects, [{"kind": "tile", "icon": "box"}, {"kind": "tile"}, {"kind": "tile"}])
        self.assertEqual(self.designer.ainvoke.await_count, 3)  # one concept, 3 tries, not per object

    async def test_skip_gives_a_plain_tile(self):
        self.designer.ainvoke.return_value = reply({"skip": True})
        obj = {"kind": "tile", "design": "vague-thing"}
        await iso_design.materialize(plan_with(obj), None)
        self.assertEqual(obj, {"kind": "tile"})


class ProjectionTests(unittest.TestCase):
    def test_box_is_three_shaded_sides_filling_the_frame(self):
        faces = iso_design.project([iso_design.Part(shape="box", at=(0, 0, 0), size=(4, 4, 4), color="teal")])
        self.assertEqual([f.shade for f in faces], [iso_design.LEFT, iso_design.RIGHT, iso_design.TOP])
        xs = [x for f in faces for x, _ in f.points]
        ys = [y for f in faces for _, y in f.points]
        self.assertEqual((min(xs), max(xs)) if max(xs) - min(xs) > max(ys) - min(ys) else (min(ys), max(ys)), (4, 96))

    def test_back_parts_are_drawn_first(self):
        front = iso_design.Part(shape="box", at=(5, 5, 0), size=(2, 2, 2), color="coral")
        back = iso_design.Part(shape="box", at=(0, 0, 0), size=(2, 2, 2), color="sky")
        fills = [f.fill for f in iso_design.project([front, back])]
        self.assertEqual(fills, ["sky"] * 3 + ["coral"] * 3)

    def test_parts_need_their_fields(self):
        with self.assertRaises(ValueError):
            iso_design.Part(shape="cylinder", at=(0, 0, 0), color="teal")

    def test_icon_search(self):
        self.assertEqual(iso_design.find_icons("credit card")[0], "credit-card")
        self.assertIn("pizza", iso_design.find_icons("pizza"))

    def test_hint_is_capped_and_states_the_order(self):
        art = iso_design.Drawing(aliases=["x"], faces=iso_design.project(
            [iso_design.Part(shape="box", at=(0, 0, 0), size=(4, 4, 4), color="teal")]))
        many = {f"thing-{i}": art for i in range(iso_design.HINT_LIMIT + 5)}
        with patch.object(iso_design, "inventory", return_value=many):
            hint = iso_design.planner_hint()
        self.assertIn(f"thing-{iso_design.HINT_LIMIT - 1}", hint)
        self.assertNotIn(f"thing-{iso_design.HINT_LIMIT} ", hint)
        self.assertIn("5 more (find_iso_objects", hint)
        self.assertLess(hint.index("Lucide icon"), hint.index("design="))


class LibraryTests(unittest.TestCase):
    def test_saved_designs_load_and_aliases_point_to_one_design(self):
        assets = iso_design.inventory()
        self.assertTrue(assets)
        names = [iso_design._norm(a) for art in assets.values() for a in art.aliases] + list(assets)
        self.assertEqual(len(names), len(set(names)), "an alias or ID names two designs")
