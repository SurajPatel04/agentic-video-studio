"""POST /videos: one API for short and long videos (length) in any layout; poll GET /videos/{id}."""

import asyncio
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from app.config import settings
from app.main import app
from app.agent.videoGenerator.nodes import plan_scenes as planner
from app.agent.videoGenerator.jobs import video_jobs
from app.agent.videoGenerator.schemas.plan import Plan
from app.utils import ids
from app.utils.render import RenderResult

settings.SKILL_ROUTER = "keyword"


def fake_render(spec, *, job_id, **_):
    d = settings.WORKSPACE_DIR / "jobs" / job_id
    d.mkdir(parents=True, exist_ok=True)
    (d / "video.mp4").write_bytes(b"mp4")
    (d / "transcript.txt").write_text("[00:01] Hello.\n")
    return RenderResult(job_id, d, d / "composition.json", d / "video.mp4", 1.0, 1, 0, [], None, "burn")


class VideosApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        patcher = patch.object(settings, "WORKSPACE_DIR", tmp)
        patcher.start()
        self.addCleanup(patcher.stop)
        runner = patch.object(settings, "VIDEO_JOB_RUNNER", "local")
        runner.start()
        self.addCleanup(runner.stop)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def wait(self, job_id, want=("done", "failed")):
        for _ in range(100):
            v = (await self.client.get(f"/videos/{job_id}")).json()
            if v["status"] in want:
                return v
            await asyncio.sleep(0.01)
        self.fail(f"job {job_id} never finished: {v}")

    async def test_short_mobile_runs_in_background_and_serves_files(self):
        plan = Plan({"fps": 30, "width": 1920, "height": 1080, "scenes": []}, 1, "catalog", 2, 100, 50, ["video-foundation"])
        with patch("app.agent.videoGenerator.jobs.video_jobs.plan_video", AsyncMock(return_value=plan)) as pv, \
                patch("app.agent.videoGenerator.jobs.video_jobs.render_video", AsyncMock(side_effect=fake_render)):
            r = await self.client.post("/videos", json={"prompt": "How HTTPS works", "layout": "mobile"})
            self.assertEqual(r.status_code, 202)
            job = r.json()
            self.assertEqual((job["length"], job["layout"], job["video_url"]), ("short", "mobile", None))
            done = await self.wait(job["id"])
        self.assertEqual(done["status"], "done", done)
        self.assertEqual(pv.call_args.kwargs["layout"], "mobile")
        self.assertEqual(done["video_url"], f"/videos/{job['id']}/video")
        self.assertEqual((await self.client.get(done["video_url"])).content, b"mp4")
        self.assertIn("Hello", (await self.client.get(done["transcript_url"])).text)

    async def test_failure_is_reported_and_files_are_refused(self):
        with patch("app.agent.videoGenerator.jobs.video_jobs.plan_video", AsyncMock(side_effect=RuntimeError("gateway down"))):
            job = (await self.client.post("/videos", json={"prompt": "Anything at all"})).json()
            done = await self.wait(job["id"])
        self.assertEqual(done["status"], "failed")
        self.assertIn("gateway down", done["error"])
        self.assertEqual((await self.client.get(f"/videos/{job['id']}/video")).status_code, 409)

    async def test_long_is_pollable_while_the_outline_is_written(self):
        gate = asyncio.Event()

        async def slow_outline(*_, **kw):
            await gate.wait()
            raise RuntimeError("outline failed")

        with patch("app.agent.videoGenerator.jobs.long_video.create_long_video", side_effect=slow_outline) as create:
            job = (await self.client.post("/videos", json={"prompt": "Full course on networks", "length": "long", "minutes": 12})).json()
            self.assertEqual((job["length"], job["status"], job["step"]), ("long", "running", "writing the outline"))
            self.assertTrue(ids.UUID4_RE.fullmatch(job["id"]), job["id"])
            gate.set()
            done = await self.wait(job["id"])
        self.assertEqual(create.call_args.kwargs["job_id"], job["id"])
        self.assertEqual(create.call_args.args[1], 12)
        self.assertEqual(done["status"], "failed")

    async def test_celery_job_is_pollable_before_the_worker_starts(self):
        with patch.object(settings, "VIDEO_JOB_RUNNER", "celery"), \
                patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async") as publish:
            for length in ("short", "long"):
                response = await self.client.post("/videos", json={"prompt": "Explain DNS", "length": length})
                self.assertEqual(response.status_code, 202)
                job = response.json()
                self.assertEqual(publish.call_args.kwargs["task_id"], job["id"])
                status = (await self.client.get(job["status_url"])).json()
                self.assertEqual((status["length"], status["status"], status["progress_percent"]),
                                 (length, "queued", "0%"))

    async def test_short_ids_are_uuid4(self):
        with patch("app.agent.videoGenerator.jobs.video_jobs.plan_video", AsyncMock(side_effect=RuntimeError("stop"))):
            job = (await self.client.post("/videos", json={"prompt": "Explain DNS"})).json()
            await self.wait(job["id"])
        self.assertTrue(ids.UUID4_RE.fullmatch(job["id"]), job["id"])

    async def test_cancel_a_running_job(self):
        started = asyncio.Event()

        async def slow_plan(*_, **__):
            started.set()
            await asyncio.sleep(60)

        with patch("app.agent.videoGenerator.jobs.video_jobs.plan_video", side_effect=slow_plan):
            job = (await self.client.post("/videos", json={"prompt": "Explain DNS"})).json()
            await started.wait()
            r = await self.client.post(f"/cancel/{job['id']}")
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual((r.json()["kind"], r.json()["status"]), ("video", "cancelled"))
            await asyncio.sleep(0)
            self.assertTrue(video_jobs._tasks[job["id"]].cancelled())
        v = (await self.client.get(f"/videos/{job['id']}")).json()
        self.assertEqual(v["status"], "cancelled")
        self.assertEqual((await self.client.post(f"/cancel/{job['id']}")).status_code, 409)  # already ended
        self.assertEqual((await self.client.post(f"/cancel/{ids.new_id()}")).status_code, 404)

    async def test_cancel_a_queued_celery_job_is_skipped_by_the_worker(self):
        with patch.object(settings, "VIDEO_JOB_RUNNER", "celery"), \
                patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async"), \
                patch("app.agent.videoGenerator.jobs.job_store.enabled", return_value=False):
            job = (await self.client.post("/videos", json={"prompt": "Explain DNS"})).json()
            self.assertEqual((await self.client.post(f"/cancel/{job['id']}")).json()["status"], "cancelled")
            with patch.object(video_jobs, "_run_short") as run:
                await video_jobs.run_queued_video(job["id"], {"prompt": "Explain DNS", "layout": "desktop"}, "short")
            run.assert_not_called()

    async def test_worker_stops_when_cancelled_while_running(self):
        started = asyncio.Event()

        async def slow_plan(*_, **__):
            started.set()
            await asyncio.sleep(60)

        with patch.object(settings, "VIDEO_JOB_RUNNER", "celery"), patch.object(settings, "JOB_HEARTBEAT_SECONDS", 0.01), \
                patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async"), \
                patch("app.agent.videoGenerator.jobs.job_store.enabled", return_value=False), \
                patch("app.agent.videoGenerator.jobs.video_jobs.plan_video", side_effect=slow_plan):
            job = (await self.client.post("/videos", json={"prompt": "Explain DNS"})).json()
            worker = asyncio.create_task(video_jobs.run_queued_video(
                job["id"], {"prompt": "Explain DNS", "layout": "desktop"}, "short"))
            await started.wait()
            video_jobs.cancel(job["id"])  # as another process would: only status.json changes
            await asyncio.wait_for(worker, 2)  # the worker notices, stops and returns normally
        self.assertEqual(video_jobs.view(job["id"])["status"], "cancelled")

    async def test_cancel_an_in_flight_request_by_its_request_id(self):
        rid = ids.new_id()
        started = asyncio.Event()

        async def slow_component(*_, **__):
            started.set()
            await asyncio.sleep(60)

        with patch("app.api.routes.components.build_component", side_effect=slow_component):
            request = asyncio.create_task(self.client.post("/components", json={"request": "Build a DNS scene"},
                                                           headers={"X-Request-ID": rid}))
            await started.wait()
            r = await self.client.post(f"/cancel/{rid}")
            self.assertEqual(r.json(), {"id": rid, "kind": "request", "status": "cancelled"})
            answer = await asyncio.wait_for(request, 2)
        self.assertEqual(answer.status_code, 499)
        self.assertEqual(answer.json()["detail"], "request cancelled")
        ok = await self.client.get("/videos")
        self.assertTrue(ids.UUID4_RE.fullmatch(ok.headers["x-request-id"]))  # no id sent: a new UUID4

    async def test_bad_input_and_unknown_id(self):
        self.assertEqual((await self.client.post("/videos", json={"prompt": "x y z", "layout": "tv"})).status_code, 422)
        self.assertEqual((await self.client.post("/videos", json={"prompt": "x y z", "length": "medium"})).status_code, 422)
        self.assertEqual((await self.client.get("/videos/abcdefabcdef")).status_code, 404)

    def test_layout_sets_the_frame(self):
        self.assertEqual(planner.apply_layout({"width": 1920, "height": 1080}, "mobile"), {"width": 1080, "height": 1920})
        self.assertEqual(planner.apply_layout({}, "square"), {"width": 1080, "height": 1080})
        self.assertEqual(planner.apply_layout({}, "desktop"), {"width": 1920, "height": 1080})

    def test_older_short_job_counts_as_done(self):
        d = settings.WORKSPACE_DIR / "jobs" / "0123456789ab"
        d.mkdir(parents=True)
        (d / "video.mp4").write_bytes(b"x")
        v = video_jobs.view("0123456789ab")
        self.assertEqual((v["status"], v["length"], v["layout"]), ("done", "short", "desktop"))


if __name__ == "__main__":
    unittest.main()
