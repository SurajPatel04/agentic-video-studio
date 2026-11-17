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
"""

import argparse
import asyncio
import json
from pathlib import Path

from app.agent.component_agent import build_component
from app.agent.staging import manifest, promote, unstage
from app.utils import long_video
from app.utils.planner import PlanError, plan_video
from app.utils.render import RenderError, add_narration, render_video
from app.utils.tts import synthesize


async def main() -> None:
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
    p = sub.add_parser("plan", help="LLM writes a composition JSON for a topic")
    p.add_argument("prompt")
    p.add_argument("--scenes", type=int)
    p.add_argument("--out", type=Path)
    p.add_argument("--mode", choices=["auto", "catalog", "tools"])
    vd = sub.add_parser("video", help="topic -> plan -> narration -> captions -> MP4")
    vd.add_argument("prompt")
    vd.add_argument("--scenes", type=int)
    vd.add_argument("--no-captions", action="store_true")
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
    lg.add_argument("--minutes", type=float, default=30)
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
    for command in (p, vd, c, lg):
        command.add_argument("--skills", nargs="*", default=None, help="Guide names; omit for automatic selection, use --skills alone to disable")
    args = parser.parse_args()

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
        try:
            plan = await plan_video(args.prompt, scenes=args.scenes, mode=args.mode, skills=args.skills)
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
        try:
            result = await render_video(spec, narrate=not args.no_narrate, captions=not args.no_captions, scale=args.scale)
        except RenderError as exc:
            raise SystemExit(f"{exc}\n{exc.details}")
        print("\n".join(result.log))
        print(f"{result.video}  ({result.seconds:.0f}s)")
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
            result = await render_video(spec, narrate=not args.no_narrate, captions=args.captions, scale=args.scale)
        except RenderError as exc:
            raise SystemExit(f"{exc}\n{exc.details}")
        print("\n".join(result.log))
        print(f"{result.video}  ({result.seconds:.0f}s, {result.voice_clips} new / {result.voice_cached} cached voice clips)")


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
                                                       captions=not args.no_captions, scale=args.scale, mode=args.mode, skills=args.skills)
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


if __name__ == "__main__":
    asyncio.run(main())
