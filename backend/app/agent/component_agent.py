"""Agent that writes a NEW scene component when nothing in the library fits.

    result = await build_component("A Huffman tree scene: merge the two smallest nodes step by step")

Loop: the LLM studies existing scenes with read-only file tools, writes a draft in its own job
folder, calls ``check_component`` (rules → typecheck → contract → render 3 frames), fixes errors,
and calls ``finish`` once checks pass. The scene is then *staged*: usable in videos and visible to
the planner, until someone promotes it (``promote``) or removes it (``unstage``).
"""

import base64
import functools
import json
import logging
import uuid
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langchain_core.utils.function_calling import convert_to_openai_tool

from app.agent.history import History, reserve_tokens

from app.agent.sandbox import Sandbox, SandboxError
from app.agent.staging import check_draft, existing_scene_names, publish, staged_names
from app.config import settings
from app.utils.llm import get_tool_llm, text_of, usage_of

log = logging.getLogger(__name__)


@dataclass
class ComponentResult:
    ok: bool
    name: str | None
    job_id: str
    summary: str
    report: str
    steps: int
    input_tokens: int
    output_tokens: int
    files: list[str] = field(default_factory=list)
    stills: list[str] = field(default_factory=list)


SYSTEM = """You are a senior React + Remotion engineer adding ONE new scene component to an educational
explainer-video library. Every frame is rendered from the frame number, so code must be deterministic.

Your draft folder: {job}/   (the ONLY place you can write)
Write the scene as {job}/<Name>.tsx. Name: PascalCase ending in "Scene" (not one of the existing names).
It will be checked at rendering/src/staging/<Name>.tsx, so import project code with '../' paths
exactly as files in rendering/src/scenes/ do (e.g. '../theme', '../animation', '../motion', '../components/Device').

File contract (must match exactly):
```tsx
import {{AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring}} from 'remotion';
import {{z}} from 'zod';
import {{entrance}} from '../animation';
import {{useTheme, useUnit}} from '../theme';

export const schema = z.object({{
  title: z.string().default('...'),          // EVERY field needs .default(...) or .optional()
  // ... the JSON props the planner can set; arrays/objects get sensible example defaults
}});
export const description = 'One or two sentences: what it shows and when to use it.';
export const tags = ['topic', 'words', 'for', 'search'];

export const <Name>: React.FC<z.input<typeof schema>> = (input) => {{
  const p = schema.parse(input);
  const f = useCurrentFrame();
  const {{fps, width, height}} = useVideoConfig();
  const theme = useTheme();   // theme.text, theme.muted, theme.accent, theme.background
  const u = useUnit();        // 1u = 1px at 1080p; size everything as N * u
  return <AbsoluteFill>...</AbsoluteFill>;
}};
```
Rules:
- Animate ONLY from useCurrentFrame() (interpolate / spring). No Math.random, Date, timers, fetch, storage.
- Imports allowed: react, remotion, zod, three, @react-three/fiber, @remotion/*, lucide-react, and project files via '../'.
- Inline styles only; sizes as N * u; colours from theme (or props). Text stays inside the 1920x1080 frame with ~70u margins.
- Content comes from props (good defaults that show a real example), never hard-coded only.
- Reuse what exists: '../motion' (AnimatedText with **bold**/==highlight== markup, Stagger, CountUp, DrawArrow),
  '../animation' (entrance('fade-up' | 'pop' | ..., frame, fps, u)), '../components/Device' (<Device kind=... />),
  '../effects' (FlowPath, SignalWaves, Callout, Badge, Mark...). Read them before using them.
- Keep it one file, clear and readable (~80-250 lines).

Workflow:
1. Look at 1-2 similar scenes first (list_dir rendering/src/scenes, read_file, grep). Don't read everything.
2. write_file your draft, then check_component(name). It runs: rules -> typecheck -> contract -> render 3 frames.
3. Fix every error (edit_file for small fixes) and check again.
4. Inspect the returned frames in a subsequent turn, then call finish(name, summary). Never batch finish with check_component.
5. Read specific line ranges; use edit_file for fixes instead of rewriting the entire source.
Existing scene names (don't reuse): {existing}
"""


async def build_component(request: str, *, name: str | None = None, model: str | None = None) -> ComponentResult:
    job_id = "comp-" + uuid.uuid4().hex[:10]
    job_dir = settings.WORKSPACE_DIR / "jobs" / job_id
    box = Sandbox(job_dir)
    state: dict[str, Any] = {"passed": {}, "checks": 0, "finished": None, "stills": [], "reviewed": set()}

    def guarded(fn):
        @functools.wraps(fn)  # keep the real parameters (path, content, ...) visible to the LLM
        def run(*args: Any, **kwargs: Any) -> str:
            try:
                return fn(*args, **kwargs)
            except (SandboxError, OSError) as exc:
                return f"ERROR: {exc}"
        return run

    async def check_component(name: str) -> str:
        """Run all checks on <draft folder>/<name>.tsx: rules, typecheck, contract, render 3 frames.
        Passing does NOT publish the scene; finish does, after you have looked at the frames."""
        state["reviewed"].discard(name)
        state["passed"].pop(name, None)
        state["checks"] += 1
        if state["checks"] > settings.AGENT_MAX_CHECKS:
            return "ERROR: too many checks; stop and call finish with what you have, or give up."
        draft = job_dir / f"{name}.tsx"
        report = await check_draft(name, draft, job_dir, request)
        if report.ok:
            state["passed"][name] = draft.read_text()
            state["stills"] = [str(p) for p in report.stills]
        return report.text()

    async def finish(name: str, summary: str) -> str:
        """Call once check_component passed and you have reviewed the frames: publishes the scene and ends the task.
        summary = what the scene does and its main props."""
        draft = job_dir / f"{name}.tsx"
        if name not in state["passed"]:
            return "ERROR: this name has not passed check_component yet."
        if settings.AGENT_VISION and name not in state["reviewed"]:
            return "ERROR: inspect the rendered frames in the next turn before finishing."
        if draft.read_text() != state["passed"][name]:
            return "ERROR: the draft changed after the last passing check; run check_component again."
        try:
            published = await publish(name, draft, job_dir, request)
        except RuntimeError as exc:
            state["passed"].pop(name, None)
            return f"ERROR: publishing failed (nothing was published): {exc}\nFix the draft and run check_component again."
        state["finished"] = (name, summary)
        return published

    tools = [
        StructuredTool.from_function(guarded(box.list_dir), name="list_dir", description="List a folder (path relative to the project root, e.g. 'rendering/src/scenes')."),
        StructuredTool.from_function(guarded(box.read_file), name="read_file", description="Read a file (optionally lines start_line..end_line)."),
        StructuredTool.from_function(guarded(box.glob), name="glob", description="Find files by pattern, e.g. 'rendering/src/scenes/*Scene.tsx' or '*Device*'."),
        StructuredTool.from_function(guarded(box.grep), name="grep", description="Search file contents with a regex (default folder rendering/src). Returns file:line: text."),
        StructuredTool.from_function(guarded(box.write_file), name="write_file", description=f"Create or overwrite a file in your draft folder {box.job_rel}/."),
        StructuredTool.from_function(guarded(box.edit_file), name="edit_file", description="Replace old_str (must match exactly once) with new_str in a draft file."),
        StructuredTool.from_function(guarded(box.delete_file), name="delete_file", description="Delete a file in your draft folder."),
        StructuredTool.from_function(coroutine=check_component, name="check_component", description=check_component.__doc__),
        StructuredTool.from_function(coroutine=finish, name="finish", description=finish.__doc__),
    ]
    by_name = {t.name: t for t in tools}
    existing = ", ".join(sorted(existing_scene_names()))
    want = f"\nUse the name {name}." if name else ""
    messages: list[Any] = [
        SystemMessage(SYSTEM.format(job=box.job_rel, existing=existing)),
        HumanMessage(f"New scene request: {request}{want}"),
    ]
    llm = get_tool_llm(model or settings.AGENT_MODEL or None).bind_tools(tools)
    schemas = [convert_to_openai_tool(t) for t in tools]
    history = History()
    metrics = []
    accounted = 0
    reason = "step limit reached"
    tin = tout = steps = 0
    last_report = ""
    while steps < settings.AGENT_MAX_STEPS and not state["finished"]:
        history.compact(messages, settings.AGENT_HISTORY_TURNS)
        reserved = reserve_tokens(messages, schemas)
        if reserved > settings.AGENT_MAX_CONTEXT_TOKENS:
            history.compact(messages, 1)
            reserved = reserve_tokens(messages, schemas)
        if reserved > settings.AGENT_MAX_CONTEXT_TOKENS or accounted + reserved > settings.AGENT_MAX_INPUT_TOKENS:
            reason = "token reservation exceeds remaining budget or context limit"
            break
        started = time.monotonic()
        msg = await llm.ainvoke(messages)
        # A passing check's frames were present in this call, before tools execute.
        state["reviewed"].update(state["passed"])
        steps += 1
        i, o = usage_of(msg)
        tin, tout = tin + i, tout + o
        accounted += i if i else reserved
        metrics.append({"step": steps, "reserved_input_tokens": reserved,
                        "input_tokens": i, "output_tokens": o,
                        "cached_input_tokens": (getattr(msg, "usage_metadata", None) or {}).get("input_token_details", {}).get("cache_read", 0),
                        "seconds": round(time.monotonic() - started, 3),
                        "tools": [c["name"] for c in msg.tool_calls]})
        (job_dir / "usage.json").write_text(json.dumps(metrics, indent=2))
        messages.append(msg)
        if not msg.tool_calls:
            messages.append(HumanMessage("Continue: use the tools. When the check passes, call finish(name, summary)."))
            continue
        for call in msg.tool_calls:
            tool = by_name.get(call["name"])
            if tool is None:
                result = f"ERROR: unknown tool {call['name']}"
            else:
                try:
                    result = await tool.ainvoke(call["args"])
                except Exception as exc:  # bad arguments etc.
                    result = f"ERROR: {exc}"
            if call["name"] == "check_component":
                last_report = str(result)
            log.info("agent.tool job=%s step=%d tool=%s args=%s", job_id, steps, call["name"], json.dumps(call["args"])[:160])
            messages.append(ToolMessage(str(result)[:12000], tool_call_id=call["id"]))
            if state["finished"]:
                break
        # Let the model SEE its render after a passing check (if it can read images).
        if settings.AGENT_VISION and state["stills"] and any(c["name"] == "check_component" for c in msg.tool_calls) and "ALL CHECKS PASSED" in last_report:
            images = [{"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(Path(p).read_bytes()).decode()}} for p in state["stills"]]
            messages.append(HumanMessage([{"type": "text", "text": "These are frames 10, middle and last of your scene. If something overlaps, is cut off, empty or hard to read, fix it and check again; otherwise call finish."}, *images]))

    files = sorted(box.rel(p) for p in job_dir.glob("*.tsx"))
    if state["finished"]:
        n, summary = state["finished"]
        log.info("agent.ok job=%s name=%s steps=%d tokens_in=%d tokens_out=%d", job_id, n, steps, tin, tout)
        return ComponentResult(True, n, job_id, summary, last_report, steps, tin, tout, files, state["stills"])
    log.warning("agent.failed job=%s reason=%s steps=%d", job_id, reason, steps)
    return ComponentResult(False, None, job_id, f"No passing component ({reason}). Last text: {text_of(messages[-1])[:300]}", last_report, steps, tin, tout, files, state["stills"])


def list_staged() -> list[str]:
    return staged_names()
