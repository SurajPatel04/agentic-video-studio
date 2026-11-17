"""IsoScene continuations: the next scene lists only changes; the rest carries over without re-animating."""

import copy
import unittest

from app.utils.iso import expand_continuations


def base():
    return {"id": "s1", "component": "IsoScene", "props": {
        "title": "Health checks",
        "objects": [{"id": "lb", "kind": "loadbalancer", "at": [0, 0]},
                    {"id": "a", "kind": "server", "at": [3.5, -3.5], "status": 40},
                    {"id": "c", "kind": "server", "at": [7, -7]}],
        "links": [{"from": "lb", "to": "a"}, {"from": "lb", "to": "c"}],
        "steps": [{"at": 0.4, "target": "a", "status": 90, "highlight": True},
                  {"at": 0.6, "target": "c", "color": "coral", "label": "Down"},
                  {"at": 0.9, "target": "c", "hide": True}]}}


class ContinueTests(unittest.TestCase):
    def test_carries_end_state_without_entrance(self):
        spec = {"scenes": [base(), {"id": "s2", "component": "IsoScene", "props": {
            "continue": True, "objects": [{"id": "b", "kind": "server", "at": [3.5, 0]}],
            "links": [{"from": "lb", "to": "b"}], "steps": [{"at": 0.5, "target": "b", "note": "New server"}]}}]}
        expand_continuations(spec)
        s2 = spec["scenes"][1]
        objs = {o["id"]: o for o in s2["props"]["objects"]}
        self.assertEqual(objs["a"]["status"], 90)  # end state of the previous scene
        self.assertEqual(objs["a"]["enter"], "none")  # no drop-in again
        self.assertTrue(objs["c"]["ghost"])  # hidden at the end of s1: only keeps its place
        self.assertEqual(objs["b"].get("enter", "drop"), "drop")  # the new one animates
        self.assertEqual({(l["from"], l["to"]) for l in s2["props"]["links"]}, {("lb", "a"), ("lb", "b")})
        self.assertEqual(s2["props"]["title"], "Health checks")
        self.assertEqual(s2["transition"], {"type": "none"})
        self.assertTrue(s2["props"]["continued"])
        self.assertNotIn("continue", s2["props"])
        # the first scene reserves room for the later server, so the layout never jumps
        self.assertTrue({o["id"]: o for o in spec["scenes"][0]["props"]["objects"]}["b"]["ghost"])

    def test_remove_and_idempotent(self):
        spec = {"scenes": [base(), {"id": "s2", "component": "IsoScene", "props": {"continue": True, "remove": ["a"], "steps": []}}]}
        expand_continuations(spec)
        once = [dict(o) for o in spec["scenes"][1]["props"]["objects"]]
        self.assertTrue({o["id"]: o for o in once}["a"]["ghost"])
        self.assertEqual(spec["scenes"][1]["props"]["links"], [])  # lb->c gone (c hidden), lb->a gone (removed)
        expand_continuations(spec)
        self.assertEqual(spec["scenes"][1]["props"]["objects"], once)

    def test_continue_after_other_scene_is_ignored(self):
        spec = {"scenes": [{"id": "t", "component": "TitleScene", "props": {}},
                           {"id": "s", "component": "IsoScene", "props": {"continue": True, "objects": [], "links": [], "steps": []}}]}
        expand_continuations(spec)
        self.assertNotIn("continue", spec["scenes"][1]["props"])
        self.assertNotIn("continued", spec["scenes"][1]["props"])


if __name__ == "__main__":
    unittest.main()


class PaperCodeSceneTests(unittest.TestCase):
    def test_code_scene_becomes_editor_in_paper_videos(self):
        from app.utils.iso import paper_code_scenes
        code = {"component": "CodeScene", "props": {"title": "The code", "language": "python", "code": "a = 1\nprint(a)\n", "highlightLines": [2, 9]}}
        spec = paper_code_scenes({"scenes": [{"component": "IsoScene", "props": {}}, copy.deepcopy(code)]})
        editor = spec["scenes"][1]
        self.assertEqual(editor["component"], "EditorScene")
        self.assertEqual(editor["props"]["filename"], "main.py")
        self.assertEqual(editor["props"]["code"], "a = 1\nprint(a)")
        self.assertEqual(editor["props"]["actions"], [{"at": 0.2, "do": "highlight", "line": 2}])  # line 9 does not exist
        # a dark-theme video keeps its CodeScene
        self.assertEqual(paper_code_scenes({"scenes": [copy.deepcopy(code)]})["scenes"][0]["component"], "CodeScene")
