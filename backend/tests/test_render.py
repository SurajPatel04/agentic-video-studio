import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.config import settings
from app.utils import render


class SceneRenderingTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_scene_is_rejected_before_requesting_narration(self):
        spec = {"fps": 30, "width": 640, "height": 360, "scenes": [
            {"id": "bad-example", "component": "NotAScene", "durationInFrames": 60,
             "narration": {"text": "This request should never be sent."}},
        ]}
        with tempfile.TemporaryDirectory() as work, patch.object(settings, "WORKSPACE_DIR", Path(work)), \
                patch.object(render, "synthesize", AsyncMock()) as synthesize:
            with self.assertRaises(render.RenderError) as error:
                await render.render_video(spec, job_id="test")
            self.assertIn("scenes[0] (bad-example).component", error.exception.details)
            self.assertFalse((Path(work) / "jobs/test/video.mp4").exists())
        synthesize.assert_not_awaited()

    async def test_audio_error_names_its_scene(self):
        spec = {"scenes": [
            {"id": "intro"},
            {"id": "worked-example", "narration": {"text": "Read the example."}},
        ]}
        with patch.object(render, "synthesize", AsyncMock(side_effect=RuntimeError("TTS unavailable"))):
            with self.assertRaisesRegex(render.RenderError, r"Scene 2 \(worked-example\) audio"):
                await render.add_narration(spec)
