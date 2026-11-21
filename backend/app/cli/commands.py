"""Command line for the backend's audio + render steps (same code the API uses).

    python -m app.cli voice ../rendering/examples/narrated-lan.json      -> *.voiced.json (narration → voice clips)
    python -m app.cli render ../rendering/examples/narrated-lan.json     -> workspace/jobs/<id>/video.mp4
    python -m app.cli render file.json --no-narrate --scale 0.5
    python -m app.cli render file.json --no-captions                     (or --captions to force them on)
    python -m app.cli tts "Hello there" [--voice aura-2-thalia-en]       -> prints the clip path
    python -m app.cli plan "Explain LAN, MAN and WAN" [--scenes 7] [--out plan.json]
    python -m app.cli video "Explain LAN, MAN and WAN" [--no-captions] [--scale 0.5]   -> plan + voice + render
    python -m app.cli component "A bubble sort scene that swaps bars step by step" [--name BubbleSortScene]
    python -m app.cli staged | promote BubbleSortScene | unstage BubbleSortScene

  Long videos (outline -> chapters -> render -> join; saved in workspace/long/<id>/, resumable):
    python -m app.cli long "How Node.js works" --minutes 30 [--chapters 6] [--outline-only] [--plan-only]
    python -m app.cli long-run <id> [--plan-only]          start / resume (skips finished chapters)
    python -m app.cli long-status <id>                     outline, chapter status, tokens, timestamps
    python -m app.cli long-redo <id> 3 [--stage render] [--cascade]   then long-run again

  Queued on the Celery workers (VIDEO_JOB_RUNNER=celery; same as POST /videos):
    python -m app.cli videos "How DNS works" [--length long --minutes 20] [--layout mobile] [--follow]
    python -m app.cli status <id> [--follow]               status, step, progress
    python -m app.cli log <id> [--limit 200] [--follow]    log from Redis: status changes + worker log lines
    python -m app.cli cancel <id>                          stop a queued / worker-running job
"""

import argparse
import asyncio
import json
import time
from contextlib import nullcontext
from pathlib import Path

from app.agent.videoGenerator.components.component_agent import build_component
from app.agent.videoGenerator.components.staging import manifest, promote, unstage
from app.agent.videoGenerator.jobs.scene_stream import streaming_video
from app.agent.videoGenerator.jobs import job_store, long_video, video_jobs
from app.agent.videoGenerator.generator import plan_video
from app.agent.videoGenerator.nodes.plan_scenes import PlanError
from app.config import settings
from app.utils.console import setup_logging
from app.utils.render import RenderError, add_narration, render_video
from app.utils.tts import synthesize


async def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("voice", help="add Deepgram narration audio to a composition JSON")
    v.add_argument("file", type=Path)
    v.add_argument("out", type=Path, nargs="?")
    r = sub.add_parser("render", help="narrate, validate and render a composition JSON to MP4")
    r.add_argument("file", type=Path)
    r.add_argument("--no-narrate", action="store_true")
    r.add_argument("--scale", type=float, default=1.0)
    cap = r.add_mutually_exclusive_group()
    cap.add_argument("--captions", dest="captions", action="store_true", default=None)
    cap.add_argument("--no-captions", dest="captions", action="store_false")
    r.add_argument("--captions-mode", choices=["burn", "track", "both"], help="burn = in the picture; track = player can switch it; both")
    p = sub.add_parser("plan", help="LLM writes a composition JSON for a topic")
    p.add_argument("prompt")
    p.add_argument("--scenes", type=int)
    p.add_argument("--out", type=Path)
    p.add_argument("--mode", choices=["auto", "catalog", "tools"])
    vd = sub.add_parser("video", help="topic -> plan -> narration -> captions -> MP4")
    vd.add_argument("prompt")
    vd.add_argument("--scenes", type=int)
    vd.add_argument("--no-captions", action="store_true")
    vd.add_argument("--captions-mode", choices=["burn", "track", "both"], help="burn = in the picture; track = player can switch it; both")
    vd.add_argument("--no-narrate", action="store_true")
    vd.add_argument("--scale", type=float, default=1.0)
    vd.add_argument("--mode", choices=["auto", "catalog", "tools"])
    t = sub.add_parser("tts", help="speak one text")
    t.add_argument("text")
    t.add_argument("--voice")
    c = sub.add_parser("component", help="agent writes, checks and stages a new scene")
    c.add_argument("request")
    c.add_argument("--name")
    sub.add_parser("staged", help="list staged (agent-made) scenes")
    for cmd in ("promote", "unstage"):
        sub.add_parser(cmd).add_argument("name")
    lg = sub.add_parser("long", help="long video: outline, plan every chapter, render, join")
    lg.add_argument("prompt")
    lg.add_argument("--minutes", type=float, default=30, help="the most it may take; the content decides (can be shorter)")
    lg.add_argument("--fixed-length", action="store_true", help="make it exactly --minutes long")
    lg.add_argument("--chapters", type=int)
    lg.add_argument("--outline-only", action="store_true", help="only write the outline")
    lg.add_argument("--plan-only", action="store_true", help="plan every chapter, don't render")
    lg.add_argument("--no-captions", action="store_true")
    lg.add_argument("--scale", type=float, default=1.0)
    lg.add_argument("--mode", choices=["auto", "catalog", "tools"])
    lr = sub.add_parser("long-run", help="start / resume a long video")
    lr.add_argument("id")
    lr.add_argument("--plan-only", action="store_true")
    sub.add_parser("long-status").add_argument("id")
    rd = sub.add_parser("long-redo", help="re-plan or re-render one chapter")
    rd.add_argument("id")
    rd.add_argument("chapter", type=int)
    rd.add_argument("--stage", choices=["plan", "render"], default="plan")
    rd.add_argument("--cascade", action="store_true", help="also re-plan the chapters after it")
    q = sub.add_parser("videos", help="queue a video on the Celery workers (VIDEO_JOB_RUNNER=celery); same as POST /videos")
    q.add_argument("prompt")
    q.add_argument("--length", choices=["short", "long"], default="short")
    q.add_argument("--scenes", type=int, help="short: rough number of scenes")
    q.add_argument("--minutes", type=float, default=30, help="long: the most it may take")
    q.add_argument("--fixed-length", action="store_true", help="long: make it exactly --minutes long")
    q.add_argument("--chapters", type=int)
    q.add_argument("--no-captions", action="store_true")
    q.add_argument("--captions-mode", choices=["burn", "track", "both"])
    q.add_argument("--no-narrate", action="store_true")
    q.add_argument("--scale", type=float, default=1.0)
    q.add_argument("--mode", choices=["auto", "catalog", "tools"])
    q.add_argument("--follow", action="store_true", help="then print progress and log lines until it ends")
    st = sub.add_parser("status", help="status, step and progress of a /videos job (short or long)")
    st.add_argument("id")
    st.add_argument("--follow", action="store_true", help="keep printing until it ends")
    sub.add_parser("cancel", help="cancel a queued or Celery-running video job (jobs run inside the API: POST /cancel/{id})").add_argument("id")
    lgl = sub.add_parser("log", help="a Celery job's log from Redis (status changes + worker log lines)")
    lgl.add_argument("id")
    lgl.add_argument("--limit", type=int, default=200)
    lgl.add_argument("--follow", action="store_true", help="keep printing new lines until it ends")
    for command in (p, vd, c, lg, q):
        command.add_argument("--skills", nargs="*", default=None, help="Guide names; omit for automatic selection, use --skills alone to disable")
    for command in (p, vd, lg, q):
        command.add_argument("--layout", choices=["desktop", "mobile", "square"], default="desktop")
    args = parser.parse_args()

    if args.cmd in ("videos", "status", "log", "cancel"):
        await jobs_cmd(args)
        return
    if args.cmd.startswith("long"):
        await long_cmd(args)
        return

    if args.cmd == "component":
        r = await build_component(args.request, name=args.name, skills=args.skills)
        print(r.report)
        print(f"\n{'STAGED ' + r.name if r.ok else 'FAILED'} | steps={r.steps} tokens in={r.input_tokens} out={r.output_tokens} | job {r.job_id}")
        print(r.summary)
        for p in r.stills:
            print("  still:", p)
        return
    if args.cmd == "staged":
        print(json.dumps(manifest(), indent=2))
        return
    if args.cmd == "promote":
        print(await promote(args.name))
        return
    if args.cmd == "unstage":
        await unstage(args.name)
        print("removed", args.name)
        return

    if args.cmd in ("plan", "video"):
        session = streaming_video(layout=args.layout, scale=args.scale, captions=not args.no_captions,
                                  narrate=not args.no_narrate, captions_mode=args.captions_mode) if args.cmd == "video" else nullcontext()
        async with session as work:
            try:
                plan = await plan_video(args.prompt, scenes=args.scenes, mode=args.mode, skills=args.skills, layout=args.layout)
            except PlanError as exc:
                raise SystemExit(f"{exc}\n{exc.details}")
            spec = plan.spec
            print(f"planned {len(spec['scenes'])} scenes | mode={plan.mode} attempts={plan.attempts} llm_calls={plan.llm_calls} "
                  f"tokens in={plan.input_tokens} out={plan.output_tokens}")
            if args.cmd == "plan":
                out = args.out or Path("plan.json")
                out.write_text(json.dumps(spec, indent=2) + "\n")
                print(out)
                return
            if work:
                await work.finish()
            try:
                result = await render_video(spec, narrate=not args.no_narrate, captions=not args.no_captions, scale=args.scale,
                                            captions_mode=args.captions_mode)
            except RenderError as exc:
                raise SystemExit(f"{exc}\n{exc.details}")
        print("\n".join(result.log))
        print(f"{result.video}  ({result.seconds:.0f}s)")
        if result.subtitles:
            print(f"{result.subtitles}  (captions: {result.captions_mode})")
        return
    if args.cmd == "tts":
        clip = await synthesize(args.text, args.voice)
        print(f"{clip.path}  {clip.seconds:.1f}s  {'cached' if clip.cached else 'new'}")
    elif args.cmd == "voice":
        spec = json.loads(args.file.read_text())
        spec, made, cached, lines = await add_narration(spec)
        out = args.out or args.file.with_suffix(".voiced.json")
        out.write_text(json.dumps(spec, indent=2) + "\n")
        print("\n".join(lines))
        print(f"{made} new, {cached} cached voice clips -> {out}")
    else:
        spec = json.loads(args.file.read_text())
        try:
            result = await render_video(spec, narrate=not args.no_narrate, captions=args.captions, scale=args.scale,
                                        captions_mode=args.captions_mode)
        except RenderError as exc:
            raise SystemExit(f"{exc}\n{exc.details}")
        print("\n".join(result.log))
        print(f"{result.video}  ({result.seconds:.0f}s, {result.voice_clips} new / {result.voice_cached} cached voice clips)")
        if result.subtitles:
            print(f"{result.subtitles}  (captions: {result.captions_mode})")


ENDED = ("done", "failed", "paused", "planned", "cancelled")


def print_status(job: dict) -> None:
    line = f"{job['id']}  {job['length']}  [{job['status']}] {job.get('progress_percent', '')}  {job.get('step', '')}"
    print(line + (f"\n  ERROR: {job['error'][:1000]}" if job.get("error") else ""))
    if job.get("status") == "done":
        print(f"  video: {job.get('video_url')}  transcript: {job.get('transcript_url')}")


def print_log_line(x: dict) -> None:
    t = time.strftime("%H:%M:%S", time.localtime(x["t"]))
    if x["kind"] == "status":
        pct = video_jobs.progress_percent(x.get("progress") or 0)
        print(f"{t} STATUS {x.get('status')} {pct} {x.get('step') or ''}" + (f"  ERROR: {x['error']}" if x.get("error") else ""))
    else:
        print(f"{t} {x.get('level', ''):7} {x.get('logger', '')}: {x.get('message', '')}")


async def jobs_cmd(args) -> None:
    if args.cmd == "videos":
        if settings.VIDEO_JOB_RUNNER != "celery":
            raise SystemExit("videos queues the job for the Celery workers: set VIDEO_JOB_RUNNER=celery "
                             "(or run it here with: python -m app.cli video / long)")
        req = {"prompt": args.prompt, "length": args.length, "layout": args.layout, "scenes": args.scenes,
               "minutes": args.minutes, "fixed_length": args.fixed_length, "chapters": args.chapters,
               "narrate": not args.no_narrate, "captions": not args.no_captions, "captions_mode": args.captions_mode,
               "scale": args.scale, "skills": args.skills, "model": None, "planner": args.mode}
        start = video_jobs.start_long if args.length == "long" else video_jobs.start_short
        try:
            job_id = start(req)
        except video_jobs.QueueUnavailable as exc:
            raise SystemExit(str(exc))
        print_status(video_jobs.view(job_id) or {"id": job_id, "length": args.length, "status": "queued"})
        if not args.follow:
            print(f"follow it with: python -m app.cli log {job_id} --follow")
            return
        args.id, args.limit = job_id, 200
        args.cmd = "log"

    if video_jobs.view(args.id) is None:
        raise SystemExit(f"unknown video id {args.id}")
    if args.cmd == "cancel":
        try:
            print_status(video_jobs.cancel(args.id))
        except video_jobs.JobNotActive as exc:
            raise SystemExit(str(exc))
        print("a Celery worker stops it within", settings.JOB_HEARTBEAT_SECONDS, "s")
        return
    if args.cmd == "status":
        while True:
            job = video_jobs.view(args.id)
            print_status(job)
            if not args.follow or job["status"] in ENDED:
                return
            await asyncio.sleep(settings.JOB_HEARTBEAT_SECONDS)
            print()

    last = 0.0  # time of the newest line printed
    while True:
        lines = job_store.lines(args.id, args.limit if not last else settings.JOB_LOG_MAX)
        if lines is None:
            raise SystemExit("the job log needs VIDEO_JOB_RUNNER=celery and a reachable JOB_REDIS_URL")
        for x in lines:
            if x["t"] > last:
                print_log_line(x)
                last = x["t"]
        job = video_jobs.view(args.id)
        if not args.follow or job["status"] in ENDED:
            print_status(job)
            return
        await asyncio.sleep(settings.JOB_HEARTBEAT_SECONDS)


def print_long(state: long_video.LongState) -> None:
    print(f"{state.id}  {state.outline.title}  [{state.status}] {state.progress:.0%}  {state.step}")
    for cs, ch in zip(state.chapters, state.outline.chapters):
        extra = f"{cs.words}/{ch.words} words, {cs.scenes} scenes" if cs.words else f"budget {ch.words} words"
        took = f", {cs.seconds / 60:.1f} min" if cs.seconds else ""
        print(f"  {cs.n:2}. {cs.status:8} {ch.title}  ({ch.minutes:g} min; {extra}{took})" + (f"\n      ERROR: {cs.error[:300]}" if cs.error else ""))
    print(f"LLM calls={state.llm_calls} tokens in={state.input_tokens} out={state.output_tokens}")
    if state.timestamps:
        print("\n".join(state.timestamps))
    if state.video:
        print(state.video)
    if state.error and not any(c.error for c in state.chapters):
        print("ERROR:", state.error[:1000])


async def long_cmd(args) -> None:
    if args.cmd == "long":
        try:
            state = await long_video.create_long_video(args.prompt, args.minutes, chapters=args.chapters,
                                                       captions=not args.no_captions, scale=args.scale, mode=args.mode, skills=args.skills,
                                                       fixed_length=args.fixed_length, layout=args.layout)
        except PlanError as exc:
            raise SystemExit(f"{exc}\n{exc.details}")
        print_long(state)
        if args.outline_only:
            print(f"\nreview workspace/long/{state.id}/state.json, then: python -m app.cli long-run {state.id}")
            return
        state = await long_video.run_long_video(state.id, render=not args.plan_only)
    elif args.cmd == "long-run":
        state = await long_video.run_long_video(args.id, render=not args.plan_only)
    elif args.cmd == "long-redo":
        state = long_video.redo_chapter(args.id, args.chapter, args.stage, cascade=args.cascade)
    else:
        state = long_video.load(args.id)
    print_long(state)
