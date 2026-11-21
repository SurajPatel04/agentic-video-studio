"""A finished job's narration clips are deleted; clips another job may still need are kept."""
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from app.agent.videoGenerator.jobs.audio_cleanup import remove_chapters, remove_job_audio
from app.config import settings
from app.utils.tts import tts_dir


class AudioCleanupTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        for name, value in (("WORKSPACE_DIR", root / "workspace"), ("RENDERING_DIR", root / "rendering"), ("AUDIO_CLEANUP", True)):
            p = patch.object(settings, name, value)
            p.start()
            self.addCleanup(p.stop)
        tts_dir().mkdir(parents=True)

    def clip(self, name, age=100):
        wav = tts_dir() / f"{name}.wav"
        wav.write_bytes(b"RIFF" + b"\0" * 100)
        (tts_dir() / f"{name}.words-v2.json").write_text("[]")
        old = time.time() - age
        os.utime(wav, (old, old))
        return wav

    def job(self, job_id, clips, status, chapter=None):
        folder = settings.WORKSPACE_DIR / "jobs" / job_id
        target = folder / "chapters" / chapter if chapter else folder
        target.mkdir(parents=True, exist_ok=True)
        (folder / "status.json").write_text(json.dumps({"status": status}))
        composition = target / "composition.json"
        composition.write_text(json.dumps({"scenes": [{"voice": {"src": f"audio/tts/{c}.wav"}} for c in clips]}))
        written = time.time() - 50  # written after voicing, a while before the job ends
        os.utime(composition, (written, written))
        return folder

    def test_finished_job_clips_are_deleted_shared_ones_kept(self):
        own, shared, reused = self.clip("own"), self.clip("shared"), self.clip("reused")
        done = self.job("aaaaaaaaaa", ["own", "shared", "reused"], "done", chapter="ch01")
        self.job("bbbbbbbbbb", ["shared"], "running")
        reused.touch()  # another job reused it after this job's composition was written
        result = remove_job_audio(done)
        self.assertEqual((result["removed"], result["kept"]), (1, 2))
        self.assertFalse(own.exists())
        self.assertFalse((tts_dir() / "own.words-v2.json").exists())
        self.assertTrue(shared.exists() and reused.exists())

    def test_off_keeps_everything(self):
        own = self.clip("own")
        with patch.object(settings, "AUDIO_CLEANUP", False):
            remove_job_audio(self.job("aaaaaaaaaa", ["own"], "done"))
        self.assertTrue(own.exists())


class ChapterCleanupTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.job = Path(tmp.name) / "job"
        (self.job / "chapters" / "ch01").mkdir(parents=True)
        (self.job / "chapters" / "ch01" / "video.mp4").write_bytes(b"x")
        (self.job / "ch01.plan.json").write_text("{}")

    def test_chapters_removed_after_join_plans_kept(self):
        (self.job / "video.mp4").write_bytes(b"x")
        with patch.object(settings, "LONG_KEEP_CHAPTERS", False):
            remove_chapters(self.job)
        self.assertFalse((self.job / "chapters").exists())
        self.assertTrue((self.job / "ch01.plan.json").exists())

    def test_kept_without_final_video_or_when_asked(self):
        with patch.object(settings, "LONG_KEEP_CHAPTERS", False):
            remove_chapters(self.job)  # not joined yet
        self.assertTrue((self.job / "chapters").exists())
        (self.job / "video.mp4").write_bytes(b"x")
        with patch.object(settings, "LONG_KEEP_CHAPTERS", True):
            remove_chapters(self.job)
        self.assertTrue((self.job / "chapters").exists())


if __name__ == "__main__":
    unittest.main()
