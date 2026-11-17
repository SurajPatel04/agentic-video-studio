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
"""

import argparse
import asyncio
import json
from pathlib import Path

from app.agent.component_agent import build_component
from app.agent.staging import manifest, promote, unstage
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
    args = parser.parse_args()

    if args.cmd == "component":
        r = await build_component(args.request, name=args.name)
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
            plan = await plan_video(args.prompt, scenes=args.scenes, mode=args.mode)
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


if __name__ == "__main__":
    asyncio.run(main())
