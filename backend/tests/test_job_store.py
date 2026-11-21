"""Celery jobs: status, progress and logs mirrored to Redis with a TTL; a dead worker is noticed."""

import asyncio
import json
import logging
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from app.agent.videoGenerator.jobs import job_store, video_jobs
from app.config import settings


class FakeRedis:
    """The few Redis commands job_store uses, with TTLs recorded (not enforced)."""

    def __init__(self):
        self.data, self.ttl = {}, {}

    def get(self, k):
        return self.data.get(k)

    def set(self, k, v, ex=None):
        self.data[k] = v
        self.ttl[k] = ex

    def exists(self, k):
        return int(k in self.data)

    def delete(self, k):
        self.data.pop(k, None)

    def rpush(self, k, *v):
        self.data.setdefault(k, []).extend(v)

    def ltrim(self, k, start, end):
        self.data[k] = self.data[k][start:] if end == -1 else self.data[k][start:end + 1]

    def lrange(self, k, start, end):
        items = self.data.get(k, [])
        return items[start:] if end == -1 else items[start:end + 1]

    def expire(self, k, ttl):
        self.ttl[k] = ttl

    def zadd(self, k, mapping):
        self.data.setdefault(k, {}).update(mapping)

    def zremrangebyscore(self, k, low, high):
        self.data[k] = {m: s for m, s in self.data.get(k, {}).items() if not (high is None or s <= high)}

    def zrevrange(self, k, start, end):
        ranked = sorted(self.data.get(k, {}), key=self.data.get(k, {}).get, reverse=True)
        return ranked[start:end + 1]

    def pipeline(self, transaction=False):
        return _Pipe(self)


class _Pipe:
    def __init__(self, r):
        self.r, self.calls = r, []

    def __getattr__(self, name):
        return lambda *a, **kw: self.calls.append((name, a, kw))

    def execute(self):
        for name, a, kw in self.calls:
            getattr(self.r, name)(*a, **kw)


class JobStoreTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.redis = FakeRedis()
        for p in (patch.object(settings, "WORKSPACE_DIR", self.tmp), patch.object(settings, "VIDEO_JOB_RUNNER", "celery"),
                  patch.object(settings, "JOB_HEARTBEAT_SECONDS", 0.01), patch.object(job_store, "_client", self.redis),
                  patch.object(job_store, "_down_until", 0.0)):
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_status_is_mirrored_with_ttl_and_progress_log(self):
        video_jobs._save("0123456789ab", id="0123456789ab", length="short", status="queued", step="queued", progress=0.0)
        video_jobs._save("0123456789ab", status="running", step="planning scenes", progress=0.1)
        video_jobs._save("0123456789ab", step="planning scenes", progress=0.1)  # nothing changed: no new line
        snap = job_store.get("0123456789ab")
        self.assertEqual((snap["status"], snap["progress_percent"]), ("running", "10%"))
        self.assertEqual(self.redis.ttl["video:job:0123456789ab"], settings.JOB_TTL_SECONDS)
        self.assertEqual(self.redis.ttl["video:job:0123456789ab:log"], settings.JOB_TTL_SECONDS)
        lines = job_store.lines("0123456789ab")
        self.assertEqual([(x["status"], x["progress"]) for x in lines], [("queued", 0.0), ("running", 0.1)])

    def test_log_is_capped(self):
        with patch.object(settings, "JOB_LOG_MAX", 3):
            for i in range(5):
                video_jobs._save("0123456789ab", status="running", step=f"step {i}", progress=0.0)
        self.assertEqual([x["step"] for x in job_store.lines("0123456789ab")], ["step 2", "step 3", "step 4"])

    async def test_worker_heartbeats_and_sends_its_logs(self):
        seen = {}

        async def job():
            await asyncio.sleep(0.05)
            seen["alive"] = job_store.alive("0123456789ab")
            logging.getLogger("app.planner").warning("plan had 2 problems")

        async with job_store.tracking("0123456789ab", lambda: {"status": "running", "progress": 0.5}):
            await job()
        self.assertTrue(seen["alive"])
        self.assertFalse(job_store.alive("0123456789ab"))  # removed when the job ends
        snap = job_store.get("0123456789ab")
        self.assertEqual(snap["progress"], 0.5)
        self.assertIn("worker", snap)
        logs = [x for x in job_store.lines("0123456789ab") if x["kind"] == "log"]
        self.assertEqual((logs[-1]["message"], logs[-1]["level"]), ("plan had 2 problems", "WARNING"))

    async def test_prompts_stay_out_of_the_redis_log(self):
        async with job_store.tracking("0123456789ab", lambda: None):
            logging.getLogger("app.llm").info("\x1b[35mprompt · human\x1b[0m: the user's whole prompt")
            logging.getLogger("app.llm").error("✗ LLM gateway down")
            logging.getLogger("app.step").info("\x1b[32m✓\x1b[0m render 12s")
        messages = [x["message"] for x in job_store.lines("0123456789ab") if x["kind"] == "log"]
        self.assertEqual(messages, ["✗ LLM gateway down", "✓ render 12s"])  # no prompt, no colour codes
        with patch.object(settings, "JOB_LOG_PROMPTS", True):
            async with job_store.tracking("0123456789ab", lambda: None):
                logging.getLogger("app.llm").info("prompt · human: hi")
        self.assertEqual(job_store.lines("0123456789ab")[-1]["message"], "prompt · human: hi")

    def test_index_lists_newest_jobs_and_forgets_old_ones(self):
        now = time.time()
        for job_id, created in (("aaaaaaaaaaaa", now - 10), ("bbbbbbbbbbbb", now), ("cccccccccccc", now - 9 * 86400)):
            job_store.publish(job_id, {"status": "queued", "created": created})
        job_store.publish("dddddddddddd", {"status": "queued", "created": now - 5})
        self.assertEqual(job_store.recent(10), ["bbbbbbbbbbbb", "dddddddddddd", "aaaaaaaaaaaa"])  # 9-day-old one dropped

    async def test_timings_attempts_request_id_and_cost(self):
        from app.agent.videoGenerator.schemas.plan import Plan
        from app.utils.console import request_id
        from app.utils.llm_accounting import record_usage
        from app.utils.render import RenderResult
        from unittest.mock import AsyncMock

        async def plan(*_, **__):
            record_usage(object(), {"input_tokens": 1000, "output_tokens": 100, "cost_usd": 0.25}, {})
            return Plan({"scenes": []}, 1, "catalog", 1, 1000, 100, [])

        def render(spec, *, job_id, **_):
            d = settings.WORKSPACE_DIR / "jobs" / job_id
            return RenderResult(job_id, d, d / "c.json", d / "video.mp4", 1.0, 0, 0, [], None, "burn")

        token = request_id.set("req-123")
        try:
            with patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async"):
                job_id = video_jobs.start_short({"prompt": "Explain DNS", "layout": "desktop"})
        finally:
            request_id.reset(token)
        with patch.object(video_jobs, "plan_video", side_effect=plan), \
                patch.object(video_jobs, "render_video", AsyncMock(side_effect=render)), \
                patch.object(settings, "STREAM_VIDEO_SCENES", False):
            await video_jobs.run_queued_video(job_id, {"prompt": "Explain DNS", "layout": "desktop"}, "short")
        snap = job_store.get(job_id)
        self.assertEqual((snap["status"], snap["request_id"], snap["attempts"], snap["cost_usd"]), ("done", "req-123", 1, 0.25))
        self.assertLessEqual(snap["queued_at"], snap["started_at"])
        self.assertLessEqual(snap["started_at"], snap["finished_at"])
        self.assertIsNotNone(snap["wait_seconds"])
        self.assertIsNotNone(snap["run_seconds"])

    def test_dead_worker_marks_a_running_job_failed(self):
        video_jobs._save("0123456789ab", id="0123456789ab", length="short", layout="desktop", prompt="DNS",
                         status="running", step="planning scenes", progress=0.1, runner="celery")
        with patch.object(time, "time", return_value=time.time() + 60):
            self.assertEqual(video_jobs.view("0123456789ab")["status"], "failed")
            job_store.heartbeat("0123456789ab")
            self.assertEqual(video_jobs.view("0123456789ab")["status"], "running")

    def test_redis_down_never_breaks_a_job(self):
        class Down:
            def __getattr__(self, name):
                raise ConnectionError("no redis")

        with patch.object(job_store, "_client", Down()):
            status = video_jobs._save("0123456789ab", id="0123456789ab", status="queued", progress=0.0)
            self.assertEqual(status["status"], "queued")
            self.assertIsNone(job_store.alive("0123456789ab"))

    def test_render_threads_split_across_workers(self):
        with patch.object(settings, "CELERY_WORKERS", 50), patch("os.cpu_count", return_value=16):
            self.assertEqual(video_jobs.render_threads(), 1)
        with patch.object(settings, "CELERY_WORKERS", 4), patch("os.cpu_count", return_value=16):
            self.assertEqual(video_jobs.render_threads(), 4)
        with patch.object(settings, "VIDEO_JOB_RUNNER", "local"):
            self.assertIsNone(video_jobs.render_threads())


if __name__ == "__main__":
    unittest.main()
