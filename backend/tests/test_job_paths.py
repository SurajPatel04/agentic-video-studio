"""One job id = one folder: chapter renders live inside their long job's folder."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.agent.videoGenerator.jobs.storage import migrate_job_storage
from app.config import settings
from app.utils.job_paths import chapter_job_id, job_dir


class JobPathTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        patcher = patch.object(settings, "WORKSPACE_DIR", Path(tmp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.jobs = Path(tmp.name) / "jobs"

    def test_chapter_renders_inside_the_job_folder(self):
        parent = "3faa47fd-e9e8-4f19-b2ff-bba6e91c416f"
        self.assertEqual(job_dir(parent), self.jobs / parent)
        self.assertEqual(job_dir(chapter_job_id(parent, 2)), self.jobs / parent / "chapters" / "ch02")

    def test_migration_moves_flat_chapters_and_legacy_folders(self):
        (self.jobs / "abc123def4").mkdir(parents=True)
        (self.jobs / "long-abc123def4-ch01").mkdir()
        (self.jobs / "long-abc123def4-ch01" / "video.mp4").write_bytes(b"x")
        (self.jobs.parent / "long" / "0123456789").mkdir(parents=True)
        self.assertEqual(migrate_job_storage(), 2)
        self.assertTrue((self.jobs / "abc123def4" / "chapters" / "ch01" / "video.mp4").is_file())
        self.assertTrue((self.jobs / "0123456789").is_dir())
        self.assertFalse((self.jobs / "long-abc123def4-ch01").exists())
        self.assertFalse((self.jobs.parent / "long").exists())
        self.assertEqual(migrate_job_storage(), 0)  # running it again changes nothing


if __name__ == "__main__":
    unittest.main()
