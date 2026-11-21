import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage

from app.agent.videoGenerator.nodes import select_skills
from app.agent.videoGenerator.teaching_patterns import PREDICTION_PAUSE_SECONDS, pattern_hint
from app.config import settings
from app.utils import render
from app.utils.tts import SpeechClip


class TeachingPatternTests(unittest.IsolatedAsyncioTestCase):
    async def test_twelve_briefs_route_by_learning_objective(self):
        cases = [
            ("Explain the GET method", "recognize"),
            ("How do I send a GET request in Postman?", "operate"),
            ("Explain how DNS resolution works", "trace"),
            ("Compare GET and POST in a beginner lesson", "compare"),
            ("Interpret this API response in a beginner lesson", "interpret"),
            ("What is a primary source?", "recognize"),
            ("How do I catalog a diary in a museum?", "operate"),
            ("Explain how a bill becomes law in a lecture", "trace"),
            ("Trace how a bill becomes law in a lecture", "trace"),
            ("Compare primary and secondary sources in a lesson", "compare"),
            ("Interpret this diary entry in a history lesson", "interpret"),
            ("An ad for a bakery", ""),
        ]
        with patch.object(settings, "SKILL_ROUTER", "keyword"):
            for topic, expected in cases:
                with self.subTest(topic=topic):
                    state = {"topic": topic, "skills": None, "model": None, "hint": "Video brief."}
                    result = await select_skills.select_skills(state)
                    self.assertEqual(result["hint"], "Video brief." + pattern_hint(expected))

    async def test_model_objective_is_used_in_existing_router_call(self):
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage(
            '{"format":"make-explainer","objective":"operate","subjects":[]}'
        )
        with patch.object(settings, "SKILL_ROUTER", "llm"), patch.object(select_skills, "get_llm", return_value=model):
            result = await select_skills.route("Send a GET request in Postman")
        self.assertEqual(result.objective, "operate")
        model.ainvoke.assert_awaited_once()

    async def test_prediction_hold_delays_answer_by_configured_time(self):
        spec = {"fps": 30, "defaultTransition": {"type": "fade", "durationInFrames": 15}, "scenes": [
            {"id": "question", "durationInFrames": 30,
             "narration": {"text": "What would you change to request post two?",
                           "pauseAfterSeconds": PREDICTION_PAUSE_SECONDS}},
            {"id": "answer", "durationInFrames": 30, "narration": {"text": "Change the one to a two."}},
        ]}
        clip = SpeechClip(path=Path("test.wav"), src="audio/test.wav", seconds=2.0, cached=True)
        with patch.object(render, "synthesize", AsyncMock(return_value=clip)):
            voiced, *_ = await render.add_narration(spec, captions=False)
        question, answer = voiced["scenes"]
        speech_end = question["voice"]["startAt"] + question["voice"]["frames"]
        self.assertEqual(question["durationInFrames"] - 15 - speech_end, PREDICTION_PAUSE_SECONDS * 30)
        self.assertNotIn("pauseAfterSeconds", answer["narration"])
