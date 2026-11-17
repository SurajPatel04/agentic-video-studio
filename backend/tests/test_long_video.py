"""Long-video workflow, offline: LLM, planner and Remotion are mocked; ffmpeg joining is real."""

import asyncio
import json

import httpx
import shutil
import subprocess
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage

from app.config import settings
from app.utils import long_video as lv
from app.utils.planner import Plan
from app.utils.render import RenderResult

OUTLINE = {
    "title": "How Node.js works", "audience": "beginners", "style": "event loop is always blue",
    "glossary": [{"term": "event loop", "meaning": "runs callbacks when the stack is empty"}],
    "examples": ["a small chat server"],
    "chapters": [
        {"title": "What is Node.js", "goal": "know what Node is", "key_points": ["runtime", "V8"], "minutes": 2},
        {"title": "Event loop", "goal": "understand the loop", "key_points": ["stack", "queue"], "minutes": 4},
        {"title": "Streams", "goal": "use streams", "key_points": ["readable", "pipe"], "minutes": 2},
    ],
}


def spec_with(words: int, tag: str = "x") -> dict:
    per = max(1, words // 4)
    return {"scenes": [{"id": f"s{i}", "component": "TitleScene", "props": {},
                        "narration": {"text": " ".join([tag] * per)}} for i in range(4)]}


def make_video(path: Path, seconds: float) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=blue:s=64x36:r=30:d={seconds}",
                    "-f", "lavfi", "-i", f"sine=d={seconds}", "-c:v", "libx264", "-c:a", "aac", "-shortest", str(path)], check=True)
    return path


class LongVideoTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        llm = AsyncMock()
        llm.ainvoke.return_value = AIMessage(json.dumps(OUTLINE), usage_metadata={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150})
        with patch("app.utils.long_video.get_llm", return_value=llm):
            self.state = await lv.create_long_video("Node.js", minutes=10)
        self.addCleanup(shutil.rmtree, settings.WORKSPACE_DIR / "long" / self.state.id, True)
        self.contexts: list[str] = []
        self.rendered: list[str] = []

    async def fake_plan(self, topic, *, scenes, mode, model, context, skills=None):
        self.contexts.append(context)
        n = int(topic.split("chapter ")[1].split(",")[0])
        budget = self.state.outline.chapters[n - 1].words
        return Plan(spec_with(budget, f"ch{n}"), 1, "catalog", 1, 1000, 500)

    async def fake_render(self, spec, *, captions, job_id, scale, concurrency=None):
        self.rendered.append(job_id)
        video = make_video(settings.WORKSPACE_DIR / "jobs" / job_id / "video.mp4", 1.0)
        self.addCleanup(shutil.rmtree, video.parent, True)
        return RenderResult(job_id, video.parent, video.parent / "composition.json", video, 1.0)

    def test_outline_budgets_scale_to_target(self):
        chapters = self.state.outline.chapters
        self.assertAlmostEqual(sum(c.minutes for c in chapters), 10, places=1)  # 2+4+2 scaled to 10
        self.assertEqual(chapters[1].words, round(chapters[1].minutes * settings.LONG_WORDS_PER_MINUTE))
        self.assertEqual(self.state.input_tokens, 100)
        self.assertTrue((settings.WORKSPACE_DIR / "long" / self.state.id / "state.json").exists())

    async def test_full_run_handoffs_join_and_resume(self):
        with patch("app.utils.long_video.plan_video", side_effect=self.fake_plan), \
                patch("app.utils.long_video.render_video", side_effect=self.fake_render):
            state = await lv.run_long_video(self.state.id)
        self.assertEqual(state.status, "done", state.error)
        # chapter 3 knew what chapters 1 and 2 covered, and everything shared
        self.assertIn("Ch 1 What is Node.js", self.contexts[2])
        self.assertIn("Ch 2 Event loop", self.contexts[2])
        self.assertIn("event loop = runs callbacks", self.contexts[2])
        self.assertIn("THIS CHAPTER", self.contexts[1])
        self.assertIn("learning check if helpful", self.contexts[2])
        self.assertEqual(state.input_tokens, 100 + 3 * 1000)
        self.assertAlmostEqual(state.seconds, 3.0, delta=0.3)
        self.assertEqual(state.timestamps[0], "00:00 What is Node.js")
        self.assertTrue(state.timestamps[1].startswith("00:01"))
        chapters = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_chapters", "-of", "json", state.video],
                                             capture_output=True, text=True, check=True).stdout)["chapters"]
        self.assertEqual([c["tags"]["title"] for c in chapters], ["What is Node.js", "Event loop", "Streams"])

        # redo only chapter 2's render: nothing is planned again, only ch02 is rendered, video re-joined
        lv.redo_chapter(state.id, 2, "render")
        self.contexts.clear()
        self.rendered.clear()
        with patch("app.utils.long_video.plan_video", side_effect=self.fake_plan), \
                patch("app.utils.long_video.render_video", side_effect=self.fake_render):
            state = await lv.run_long_video(state.id)
        self.assertEqual(state.status, "done")
        self.assertEqual(self.contexts, [])
        self.assertEqual(self.rendered, [f"long-{state.id}-ch02"])

    async def test_failure_is_saved_and_resume_skips_finished(self):
        calls = 0

        async def flaky(topic, **kw):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("gateway down")
            return await self.fake_plan(topic, **kw)

        with patch("app.utils.long_video.plan_video", side_effect=flaky):
            state = await lv.run_long_video(self.state.id, render=False)
        self.assertEqual(state.status, "failed")
        self.assertEqual([c.status for c in state.chapters], ["planned", "failed", "pending"])
        self.assertEqual(state.chapters[1].failed_stage, "plan")
        self.assertIn("gateway down", lv.load(state.id).chapters[1].error)  # saved to disk

        self.contexts.clear()
        with patch("app.utils.long_video.plan_video", side_effect=self.fake_plan):
            state = await lv.run_long_video(state.id, render=False)
        self.assertEqual(state.status, "planned")
        self.assertEqual(len(self.contexts), 2)  # chapter 1 was not planned again

    async def test_off_budget_plan_is_replanned_once(self):
        plans = [spec_with(20), spec_with(self.state.outline.chapters[0].words)]
        seen = []

        async def short_then_ok(topic, *, context, **kw):
            seen.append(context)
            return Plan(plans[len(seen) - 1], 1, "catalog", 1, 10, 10)

        with patch("app.utils.long_video.plan_video", side_effect=short_then_ok):
            spec = await lv.plan_chapter(self.state, 1)
        self.assertEqual(len(seen), 2)
        self.assertIn("Make it longer", seen[1])
        self.assertEqual(spec, plans[1])

    async def test_two_bad_budgets_fail_without_accepting_plan(self):
        for words in (4, 2000):
            with self.subTest(words=words):
                lv.redo_chapter(self.state.id, 1)
                fake = AsyncMock(return_value=Plan(spec_with(words), 1, "catalog", 1, 10, 10))
                with patch.object(lv, "plan_video", fake):
                    state = await lv.run_long_video(self.state.id, render=False)
                self.assertEqual(fake.await_count, 2)
                self.assertEqual(state.status, "failed")
                self.assertEqual(state.chapters[0].failed_stage, "plan")
                self.assertIn("outside its word budget", state.error)
                self.assertFalse(lv.plan_file(state.id, 1).exists())
        with patch.object(lv, "plan_video", side_effect=self.fake_plan):
            state = await lv.run_long_video(self.state.id, render=False)
        self.assertEqual(state.status, "planned")

    async def test_resume_endpoint_starts_on_event_loop(self):
        from app.main import app
        with patch.object(lv, "plan_video", side_effect=self.fake_plan):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                response = await client.post(f"/long/{self.state.id}/run?render=false")
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(response.json()["started"])
                task = lv._tasks.get(self.state.id)  # may already be done (fake plan is instant)
                if task:
                    await task
                await asyncio.sleep(0)
        self.assertEqual(lv.load(self.state.id).status, "planned")

    async def test_edit_holds_lock_during_validation(self):
        from app.main import app
        entered, release = asyncio.Event(), asyncio.Event()

        async def validate_later(path):
            entered.set()
            await release.wait()

        with patch.object(lv, "validate", side_effect=validate_later):
            edit = asyncio.create_task(lv.set_chapter_plan(self.state.id, 1, spec_with(376)))
            try:
                await entered.wait()
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                    response = await client.post(f"/long/{self.state.id}/run?render=false")
                    self.assertEqual(response.status_code, 409)
                with self.assertRaises(lv.JobBusyError):
                    lv.replace_outline(self.state.id, self.state.outline)
                with self.assertRaises(lv.JobBusyError):
                    lv.redo_chapter(self.state.id, 1)
                with self.assertRaises(lv.JobBusyError):
                    await lv.set_chapter_plan(self.state.id, 1, spec_with(376))
                with self.assertRaises(lv.JobBusyError):
                    await lv.run_long_video(self.state.id, render=False)
            finally:
                release.set()
                await edit
        self.assertEqual(lv.load(self.state.id).chapters[0].status, "planned")
        lv.redo_chapter(self.state.id, 1)  # edit released its lock

    async def test_run_blocks_edits_and_releases_lock_on_cancel(self):
        entered = asyncio.Event()

        async def wait_plan(*args, **kwargs):
            entered.set()
            await asyncio.Event().wait()

        with patch.object(lv, "plan_video", side_effect=wait_plan):
            self.assertTrue(lv.start(self.state.id, render=False))
            task = lv._tasks[self.state.id]
            try:
                # Startup reserves the job before the task even begins.
                with self.assertRaises(lv.JobBusyError):
                    lv.redo_chapter(self.state.id, 1)
                self.assertFalse(lv.start(self.state.id))
                await entered.wait()
                with self.assertRaises(lv.JobBusyError):
                    await lv.set_chapter_plan(self.state.id, 1, spec_with(376))
            finally:
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                await asyncio.sleep(0)
        lv.redo_chapter(self.state.id, 1)
        self.assertFalse(lv.is_running(self.state.id))

    async def test_failed_validation_releases_edit_lock(self):
        with patch.object(lv, "validate", side_effect=RuntimeError("invalid plan")):
            with self.assertRaisesRegex(RuntimeError, "invalid plan"):
                await lv.set_chapter_plan(self.state.id, 1, spec_with(376))
        lv.redo_chapter(self.state.id, 1)
        self.assertFalse((lv._dir(self.state.id) / "ch01.check.json").exists())

    async def test_render_overlaps_planning_and_respects_worker_limit(self):
        events, active, peak = [], 0, 0

        async def slow_plan(topic, **kw):
            n = int(topic.split("chapter ")[1].split(",")[0])
            events.append(f"plan{n}")
            await asyncio.sleep(0.05)
            return await self.fake_plan(topic, **kw)

        async def slow_render(spec, *, job_id, **kw):
            nonlocal active, peak
            events.append("render" + job_id[-1])
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.12)
            active -= 1
            return await self.fake_render(spec, job_id=job_id, **kw)

        with patch("app.utils.long_video.plan_video", side_effect=slow_plan), \
                patch("app.utils.long_video.render_video", side_effect=slow_render), \
                patch.object(settings, "LONG_RENDER_WORKERS", 1):
            state = await lv.run_long_video(self.state.id)
        self.assertEqual(state.status, "done", state.error)
        self.assertLess(events.index("render1"), events.index("plan3"))  # chapter 1 rendered while 2/3 planned
        self.assertEqual(peak, 1)  # never more renders than workers

    async def test_failed_plan_stops_later_plans_but_finishes_started_renders(self):
        async def plan(topic, **kw):
            if "chapter 2" in topic:
                raise RuntimeError("bad plan")
            return await self.fake_plan(topic, **kw)

        with patch("app.utils.long_video.plan_video", side_effect=plan), \
                patch("app.utils.long_video.render_video", side_effect=self.fake_render):
            state = await lv.run_long_video(self.state.id)
        self.assertEqual(state.status, "failed")
        self.assertEqual([c.status for c in state.chapters], ["rendered", "failed", "pending"])
        self.assertIn("chapter 2 plan: bad plan", state.error)

    async def test_parallel_planning_plans_all_at_once(self):
        running, peak = 0, 0

        async def plan(topic, **kw):
            nonlocal running, peak
            running += 1
            peak = max(peak, running)
            await asyncio.sleep(0.05)
            running -= 1
            return await self.fake_plan(topic, **kw)

        with patch("app.utils.long_video.plan_video", side_effect=plan), \
                patch.object(settings, "LONG_PARALLEL_PLANNING", True):
            state = await lv.run_long_video(self.state.id, render=False)
        self.assertEqual(state.status, "planned", state.error)
        self.assertEqual(peak, 3)

    def test_render_threads_split_between_workers(self):
        with patch.object(settings, "LONG_RENDER_WORKERS", 2), patch.object(settings, "LONG_RENDER_CONCURRENCY", 0), \
                patch("os.cpu_count", return_value=16):
            self.assertEqual(lv.render_concurrency(), 8)
        with patch.object(settings, "LONG_RENDER_CONCURRENCY", 5):
            self.assertEqual(lv.render_concurrency(), 5)

    def test_ids_are_checked(self):
        with self.assertRaises(ValueError):
            lv.load("../../etc")


if __name__ == "__main__":
    unittest.main()
