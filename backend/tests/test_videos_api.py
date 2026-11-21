"""POST /videos: one API for short and long videos (length) in any layout; poll GET /videos/{id}."""

import asyncio
import shutil
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from app.config import settings
from app.main import app
from app.agent.videoGenerator.nodes import plan_scenes as planner
from app.agent.videoGenerator.jobs import component_jobs, video_jobs
from app.agent.videoGenerator.components.component_agent import ComponentResult
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
    """The API only queues; a fake Celery worker runs the real worker functions in this test's event loop."""

    async def asyncSetUp(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp, True)
        loop = asyncio.get_running_loop()
        self.worker_runs = []
        self.responded = asyncio.Event()  # a real worker picks the job up after the API answered

        async def answered(_response):
            self.responded.set()
            self.responded = asyncio.Event()

        def worker(run):  # apply_async is called from a thread (asyncio.to_thread in the route)
            async def pick_up(args):
                await self.responded.wait()
                await run(*args)

            def apply_async(args, task_id, retry):
                self.worker_runs.append(asyncio.run_coroutine_threadsafe(pick_up(args), loop))
            return apply_async

        for p in (patch.object(settings, "WORKSPACE_DIR", tmp), patch.object(settings, "VIDEO_JOB_RUNNER", "celery"),
                  patch.object(settings, "JOB_HEARTBEAT_SECONDS", 0.01),
                  patch("app.agent.videoGenerator.jobs.job_store.enabled", return_value=False),  # no Redis here
                  patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async",
                        side_effect=worker(video_jobs.run_queued_video)),
                  patch("app.agent.videoGenerator.jobs.tasks.build_component_job.apply_async",
                        side_effect=worker(component_jobs.run_queued_component))):
            p.start()
            self.addCleanup(p.stop)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test",
                                        event_hooks={"response": [answered]})

    async def asyncTearDown(self):
        for run in self.worker_runs:
            run.cancel()
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
        self.assertEqual((await self.client.get(f"/components/jobs/{job['id']}")).status_code, 404)

    async def test_ad_is_short_planned_as_an_ad_and_capped(self):
        plan = Plan({"fps": 30, "width": 1920, "height": 1080, "scenes": []}, 1, "catalog", 2, 100, 50, ["make-ad"])
        cases = (({"length": "long", "minutes": 10}, 3), ({"minutes": 0.5}, 0.5), ({}, settings.AD_DEFAULT_MINUTES))
        for extra, minutes in cases:
            with patch("app.agent.videoGenerator.jobs.video_jobs.plan_video", AsyncMock(return_value=plan)) as pv, \
                    patch("app.agent.videoGenerator.jobs.video_jobs.render_video", AsyncMock(side_effect=fake_render)):
                job = (await self.client.post("/videos", json={"prompt": "Promote TaskFlow", "ad": True, **extra})).json()
                self.assertEqual(job["length"], "short")
                self.assertEqual((await self.wait(job["id"]))["status"], "done")
            self.assertEqual((pv.call_args.kwargs["ad"], pv.call_args.kwargs["minutes"]), (True, minutes))
        r = await self.client.post("/videos", json={"prompt": "Full course", "length": "long", "minutes": 2})
        self.assertEqual(r.status_code, 422)  # long videos still take at least 3 minutes

    async def test_source_reaches_the_planner_and_is_size_checked(self):
        plan = Plan({"fps": 30, "width": 1920, "height": 1080, "scenes": []}, 1, "catalog", 2, 100, 50, ["video-foundation"])
        with patch("app.agent.videoGenerator.jobs.video_jobs.plan_video", AsyncMock(return_value=plan)) as pv, \
                patch("app.agent.videoGenerator.jobs.video_jobs.render_video", AsyncMock(side_effect=fake_render)):
            job = (await self.client.post("/videos", json={"prompt": "Explain our product", "source": "  TaskFlow is free.  "})).json()
            self.assertEqual((await self.wait(job["id"]))["status"], "done")
        self.assertEqual(pv.call_args.kwargs["source"], "TaskFlow is free.")
        self.assertNotIn("source", job)  # the status never echoes the source back
        with patch.object(settings, "SOURCE_MAX_CHARS", 5):
            r = await self.client.post("/videos", json={"prompt": "Explain our product", "source": "TaskFlow is free."})
        self.assertEqual(r.status_code, 422)

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
            self.assertEqual((job["length"], job["status"]), ("long", "queued"))  # the API only queues it
            self.assertTrue(ids.UUID4_RE.fullmatch(job["id"]), job["id"])
            running = await self.wait(job["id"], want=("running",))
            self.assertEqual(running["step"], "writing the outline")  # the worker writes the outline
            gate.set()
            done = await self.wait(job["id"])
        self.assertEqual(create.call_args.kwargs["job_id"], job["id"])
        self.assertEqual(create.call_args.args[1], 12)
        self.assertEqual(done["status"], "failed")

    async def test_celery_job_is_pollable_before_the_worker_starts(self):
        with patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async") as publish:
            for length in ("short", "long"):
                response = await self.client.post("/videos", json={"prompt": "Explain DNS", "length": length})
                self.assertEqual(response.status_code, 202)
                job = response.json()
                self.assertEqual(publish.call_args.kwargs["task_id"], job["id"])
                self.assertTrue((settings.WORKSPACE_DIR / "jobs" / job["id"] / "status.json").is_file())
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
            await asyncio.wait_for(asyncio.wrap_future(self.worker_runs[0]), 2)  # the worker stops by itself
        v = (await self.client.get(f"/videos/{job['id']}")).json()
        self.assertEqual(v["status"], "cancelled")
        self.assertEqual((await self.client.post(f"/cancel/{job['id']}")).status_code, 409)  # already ended
        self.assertEqual((await self.client.post(f"/cancel/{ids.new_id()}")).status_code, 404)

    async def test_cancel_a_queued_celery_job_is_skipped_by_the_worker(self):
        with patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async"):
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

        with patch("app.agent.videoGenerator.jobs.tasks.generate_video.apply_async"), \
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
        started, release = threading.Event(), threading.Event()

        def slow_list(limit):  # a request that hangs (e.g. a slow disk)
            started.set()
            release.wait(5)
            return []

        with patch.object(video_jobs, "list_jobs", side_effect=slow_list):
            request = asyncio.create_task(self.client.get("/videos", headers={"X-Request-ID": rid}))
            await asyncio.to_thread(started.wait, 2)
            r = await self.client.post(f"/cancel/{rid}")
            self.assertEqual(r.json(), {"id": rid, "kind": "request", "status": "cancelled"})
            answer = await asyncio.wait_for(request, 2)
            release.set()
        self.assertEqual(answer.status_code, 499)
        self.assertEqual(answer.json()["detail"], "request cancelled")
        ok = await self.client.get("/videos")
        self.assertTrue(ids.UUID4_RE.fullmatch(ok.headers["x-request-id"]))  # no id sent: a new UUID4

    async def test_component_agent_runs_on_the_worker_and_is_polled(self):
        result = ComponentResult(True, "DnsLookupScene", "comp-1234567890", "Staged DnsLookupScene", "all checks passed",
                                 7, 1000, 200, ["DnsLookupScene.tsx"], ["/x/still-1.png"])
        with patch("app.agent.videoGenerator.components.component_agent.build_component",
                   AsyncMock(return_value=result)) as agent:
            r = await self.client.post("/components", json={"request": "Build a DNS lookup scene"})
            self.assertEqual(r.status_code, 202)
            job = r.json()
            self.assertEqual(job["status"], "queued")  # returned at once; the agent has not run in the API
            for _ in range(100):
                done = (await self.client.get(job["status_url"])).json()
                if done["status"] in component_jobs.ENDED:
                    break
                await asyncio.sleep(0.01)
        agent.assert_awaited_once()
        self.assertEqual((done["status"], done["ok"], done["name"]), ("done", True, "DnsLookupScene"))
        self.assertEqual(done["stills"], ["/components/jobs/comp-1234567890/still-1.png"])
        self.assertIsNotNone(done["run_seconds"])
        self.assertTrue((settings.WORKSPACE_DIR / "jobs" / job["id"] / "status.json").is_file())
        self.assertEqual((await self.client.get(f"/videos/{job['id']}")).status_code, 404)
        self.assertNotIn(job["id"], {item["id"] for item in (await self.client.get("/videos")).json()})
        self.assertEqual((await self.client.get(f"/components/jobs/{ids.new_id()}")).status_code, 404)

    async def test_cancel_a_running_component_job(self):
        started = asyncio.Event()

        async def slow_agent(*_, **__):
            started.set()
            await asyncio.sleep(60)

        with patch("app.agent.videoGenerator.components.component_agent.build_component", side_effect=slow_agent):
            job = (await self.client.post("/components", json={"request": "Build a DNS lookup scene"})).json()
            await started.wait()
            r = await self.client.post(f"/cancel/{job['id']}")
            self.assertEqual((r.json()["kind"], r.json()["status"]), ("component", "cancelled"))
            await asyncio.wait_for(asyncio.wrap_future(self.worker_runs[0]), 2)
        self.assertEqual(component_jobs.view(job["id"])["status"], "cancelled")
        self.assertEqual((await self.client.post(f"/cancel/{job['id']}")).status_code, 409)

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

    def test_timing_only_record_does_not_break_job_listing(self):
        directory = settings.WORKSPACE_DIR / "jobs" / ids.new_id()
        directory.mkdir(parents=True)
        (directory / "status.json").write_text('{"finished_at": 42, "run_seconds": 1}')
        self.assertEqual(video_jobs.list_jobs(), [])


if __name__ == "__main__":
    unittest.main()
