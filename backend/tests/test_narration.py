"""What is said matches what is shown: code in narration and text cards the voice never says."""
import unittest

from app.agent.videoGenerator import validation
from app.utils.tts import spoken_text


def scene(component, props, said):
    return {"id": "s", "component": component, "props": props, "narration": {"text": said}}


class SpokenCodeTests(unittest.TestCase):
    def test_code_in_narration_is_flagged(self):
        problems = validation._lint_spoken_code([scene("ExplainScene", {}, "The client requests GET /api/watches?limit=2&after=wt_102, "
                                                                          "then reads response.data.price.")])
        self.assertEqual(len(problems), 1)
        for code in ("/api/watches?limit=2&after=wt_102", "response.data.price"):
            self.assertIn(code, problems[0])

    def test_plain_speech_is_not_code(self):
        said = "Node.js reads a file, e.g. a config, and/or a TCP/IP packet costs 3.14 dollars. The watches path lists watch W T one-oh-one."
        self.assertEqual(validation._lint_spoken_code([scene("ExplainScene", {}, said)]), [])

    def test_leftover_code_is_spoken_briefly(self):
        self.assertEqual(spoken_text("GET /api/watches?limit=2&after=wt_102."),
                         "GET slash api slash watches with limit 2 and after wt 102.")
        self.assertEqual(spoken_text("read page.next at 189.00"), "read page dot next at 189")
        self.assertEqual(spoken_text("e.g. Node.js and/or 3.14"), "e.g. Node.js and/or 3.14")


class UnsaidTextTests(unittest.TestCase):
    def test_card_line_the_voice_never_says_is_flagged(self):
        card = {"heading": "Clients build expectations from the contract",
                "points": ["A predictable item path identifies the requested watch."]}
        said = "The client's code depends on the address. Change a path or rename a field, and old code may break."
        problems = validation._lint_unsaid_text([scene("ExplainScene", card, said)])
        self.assertEqual(len(problems), 1)
        self.assertIn("A predictable item path identifies the requested watch.", problems[0])

    def test_card_said_in_other_word_forms_passes(self):
        card = {"heading": "Validate submitted watch values", "points": ["Price is a positive number."]}
        said = "Validation checks the submitted values of a watch. For example, its price must be a positive number."
        self.assertEqual(validation._lint_unsaid_text([scene("ExplainScene", card, said)]), [])

    def test_other_scenes_are_not_checked(self):
        self.assertEqual(validation._lint_unsaid_text([scene("IsoScene", {"title": "Completely different words here"}, "Hello")]), [])


if __name__ == "__main__":
    unittest.main()
