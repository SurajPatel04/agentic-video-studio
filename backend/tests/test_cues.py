import unittest

from app.utils import cues, planner

NARRATION = "The pipeline reads orders from Kafka and writes them to a warehouse. Then it crashes and we get duplicates."


def iso_scene(**extra):
    return {"id": "setup", "component": "IsoScene", "durationInFrames": 300, "narration": {"text": NARRATION},
            "props": {"objects": [{"id": "k", "kind": "queue", "at": [0, 0]},
                                  {"id": "w", "kind": "database", "at": [7, -7], "appearCue": "warehouse"}],
                      "links": [{"from": "k", "to": "w", "appearCue": "writes"}],
                      "steps": [{"cue": "crashes", "target": "w", "note": "Crash"},
                                {"cue": "duplicates", "target": "w", "note": "600 duplicates"}]}, **extra}


def heard(text, start=10, per=12):
    """Word times in scene frames, one word every ``per`` frames from ``start``."""
    return [{"t": w, "s": start + i * per, "e": start + i * per + per - 2} for i, w in enumerate(text.split())]


class CueTests(unittest.TestCase):
    def test_estimated_from_the_text_before_audio(self):
        spec, missing = cues.resolve({"scenes": [iso_scene()]})
        props = spec["scenes"][0]["props"]
        self.assertEqual(missing, {})
        steps = [s["at"] for s in props["steps"]]
        self.assertTrue(0 < props["objects"][1]["appearAt"] < steps[0] < steps[1] < 1)
        self.assertNotIn("cue", props["steps"][0])
        self.assertEqual(props["objects"][1]["at"], [7, -7])  # a grid position is never a timing

    def test_real_word_times_after_tts(self):
        scene = iso_scene(voice={"src": "x.mp3", "startAt": 10, "words": heard(NARRATION)})
        cues.resolve_scene(scene)
        words = NARRATION.split()
        said = {w.strip("."): 10 + i * 12 for i, w in enumerate(words)}
        self.assertAlmostEqual(scene["props"]["steps"][1]["at"], (said["duplicates"] - cues.LEAD) / 300, places=3)
        self.assertAlmostEqual(scene["props"]["links"][0]["appearAt"], (said["writes"] - cues.LEAD) / 300, places=3)

    def test_phrases_plurals_order_and_missing(self):
        scene = {"id": "t", "component": "TerminalScene", "durationInFrames": 200,
                 "narration": {"text": "Run the tests. Two tests fail, then the second run of the tests passes."},
                 "props": {"actions": [{"type": "run", "text": "npm test", "cue": "run the tests"},
                                       {"type": "output", "lines": ["2 failed"], "cue": "test"},
                                       {"type": "done", "text": "ok", "cue": "passes"},
                                       {"type": "clear", "cue": "deploy"}]}}
        missing = cues.resolve_scene(scene)
        at = [a.get("at") for a in scene["props"]["actions"]]
        self.assertEqual(missing, ["deploy"])
        self.assertTrue(at[0] < at[1] < at[2])  # "test" matches "tests", after the earlier cue
        self.assertEqual(at[3], 0.5)  # still valid; the planner is told about it

    def test_scenes_without_timing_fields_are_left_alone(self):
        scene = {"id": "q", "component": "QuoteScene", "props": {"quote": "x", "cue": "nothing"}}
        cues.resolve_scene(scene)
        self.assertEqual(scene["props"], {"quote": "x"})

    def test_lint_flags_guessed_timing_and_unknown_cues(self):
        guessed = iso_scene()
        guessed["props"]["steps"] = [{"at": a, "target": "w", "note": "n"} for a in (0.2, 0.5, 0.8)]
        bad = iso_scene(id="other")
        bad["props"]["steps"][0]["cue"] = "explodes"
        problems = " ".join(planner._lint_cues({"scenes": [guessed, bad]}))
        self.assertIn("scenes setup time most steps with a guessed", problems)
        self.assertIn("'other': 'explodes'", problems)
        self.assertEqual(planner._lint_cues({"scenes": [iso_scene()]}), [])

    def test_get_scene_explains_cues(self):
        self.assertIn('"cue"', planner.get_scene.invoke({"name": "EditorScene"}))
