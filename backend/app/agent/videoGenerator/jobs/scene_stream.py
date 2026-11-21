"""Overlap scene planning with provisional media work. Only matching validated ranges are reused."""
import asyncio
import copy
import hashlib
import json
import logging
import re
import shutil
import tempfile
from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from pathlib import Path

from langchain_core.messages import message_chunk_to_message
from openai import BadRequestError

from app.config import settings
from app.utils import cues, render, subtitles
from app.utils.llm import text_of

log = logging.getLogger(__name__)
active = ContextVar("scene_stream", default=None)


class SceneReader:
    """Read complete objects in the root scenes array, across arbitrary text chunk boundaries."""
    opening = re.compile(r'^\s*(?:```(?:json)?\s*)?\{\s*"scenes"\s*:\s*\[', re.I)

    def __init__(self):
        self.buffer = ""
        self.started = False
        self.done = False
        self.depth = 0
        self.quoted = self.escaped = False
        self.parts = []

    def feed(self, text):
        if self.done or not text:
            return
        if not self.started:
            self.buffer += text
            match = self.opening.match(self.buffer)
            if not match:
                self.done = len(self.buffer) > 512
                return
            self.started = True
            text = self.buffer[match.end():]
            self.buffer = ""
        start = 0
        for i, char in enumerate(text):
            if self.depth == 0:
                if char in " \r\n\t,":
                    continue
                if char != "{":
                    self.done = True
                    return
                start = i
            if self.quoted:
                if self.escaped:
                    self.escaped = False
                elif char == "\\":
                    self.escaped = True
                elif char == '"':
                    self.quoted = False
            elif char == '"':
                self.quoted = True
            elif char in "{[":
                self.depth += 1
            elif char in "}]":
                self.depth -= 1
                if not self.depth:
                    self.parts.append(text[start:i+1])
                    try:
                        scene = json.loads("".join(self.parts))
                    except ValueError:
                        self.done = True
                        return
                    self.parts.clear()
                    yield scene
        if self.depth:
            self.parts.append(text[start:])


async def planner_response(llm, messages, *, tools=False, lecture=False, explainer=False):
    work = active.get()
    if work is None:
        return await llm.ainvoke(messages)
    work.lecture, work.explainer = lecture, explainer
    reader = SceneReader()
    chunks = []
    scenes = []
    try:
        # Responses API reports usage on completion; Chat Completions needs stream_options.
        async for chunk in llm.astream(messages, **({} if tools else {"stream_usage": True})):
            chunks.append(chunk)
            for scene in reader.feed(text_of(chunk)):
                scenes.append(scene)
                work.submit(scenes)
    except BadRequestError as exc:
        if chunks or 'stream' not in str(exc).lower():
            raise
        log.warning("Provider declined streaming, using a complete planner response")
        return await llm.ainvoke(messages)
    if not chunks:
        raise ValueError("Planner stream ended without a response")
    return message_chunk_to_message(chunks[0] + chunks[1:])


def signature(spec, index):
    # Include the full timeline prefix, branding, audio and the following transition.
    # The extra lookahead leaves the following scene's narration and duration settled.
    prefix = {**spec, "scenes": spec["scenes"][:index + 2]}
    return hashlib.sha256(json.dumps(prefix, sort_keys=True).encode()).digest()


class SceneStream:
    def __init__(self, *, layout, scale, captions, captions_mode=None, narrate=True, intro=True,
                 concurrency=None, slots=None):
        self.layout, self.scale, self.captions = layout, scale, captions
        self.captions_mode, self.narrate, self.intro = captions_mode, narrate, intro
        self.concurrency = concurrency
        self.slots = slots or asyncio.Semaphore(1)
        self.temp = tempfile.TemporaryDirectory(prefix="video-stream-")
        self.path = Path(self.temp.name)
        self.latest = []
        self.ready = None
        self.preparation = self.renderer = None
        self.signatures = []
        self.closed = False
        self.lecture = self.explainer = False

    @contextmanager
    def use(self):
        token = active.set(self)
        try:
            yield
        finally:
            active.reset(token)

    def submit(self, scenes):
        # One attempt can be replaced by a repair. Keep processing its prefix only;
        # the final plan remains authoritative and is compared before reusing media.
        if self.closed or (self.latest and scenes[0] is not self.latest[0]):
            return
        self.latest = scenes.copy()
        if self.preparation is None or self.preparation.done():
            self.preparation = asyncio.create_task(self.prepare())

    async def prepare(self):
        from ..schemas.plan import Plan
        from ..tools.iso_design import materialize
        from ..validation import _normalize, apply_reading_time
        try:
            while not self.closed:
                batch = self.latest
                spec = _normalize({"scenes": copy.deepcopy(batch)}, layout=self.layout)
                apply_reading_time(spec, lecture=self.lecture, explainer=self.explainer)
                await materialize(Plan(spec, 0, "stream", 0, 0, 0), None, generate_missing=False)
                spec = (render.apply_brand if self.intro else render.without_intro)(spec)
                spec = render.set_caption_mode(render.set_captions(spec, self.captions), self.captions_mode)
                estimated, _ = cues.resolve(spec)
                path = self.path / "check.json"
                path.write_text(json.dumps(estimated))
                await render.validate(path)
                if self.narrate:
                    spec, *_ = await render.add_narration(spec)
                    spec, _ = cues.resolve(spec)
                    path.write_text(json.dumps(spec))
                    await render.validate(path)
                else:
                    spec = estimated
                self.ready = spec
                if len(batch) >= 3 and (self.renderer is None or self.renderer.done()):
                    self.renderer = asyncio.create_task(self.draw())
                if self.latest is batch:
                    break
        except Exception as exc:
            log.info("Streamed prefix deferred to final validation: %s", exc)

    async def draw(self):
        try:
            async with self.slots:
                while not self.closed:
                    spec = self.ready
                    first = len(self.signatures)
                    stop = min(first + 4, len(spec["scenes"]) - 2)
                    if stop <= first:
                        return
                    path = self.path / "render.json"
                    path.write_text(json.dumps(spec))
                    starts = subtitles._scene_starts(spec, spec["fps"])
                    log.info("stream.render scenes %d–%d during planning", first + 1, stop)
                    code, output = await render._run([
                        "node", "scripts/render-scenes.mjs", str(path), str(self.path), json.dumps(starts),
                        str(self.scale), str(self.concurrency or 0), str(first), str(stop),
                    ], timeout=settings.RENDER_TIMEOUT_SECONDS)
                    if code:
                        raise RuntimeError(output[-800:])
                    self.signatures.extend(signature(spec, i) for i in range(first, stop))
        except Exception as exc:
            log.warning("Early render deferred to final composition: %s", exc)

    async def finish(self):
        self.closed = True
        if self.preparation:
            await self.preparation
        if self.renderer:
            await self.renderer

    def reuse(self, spec, destination):
        count = 0
        for i, saved in enumerate(self.signatures):
            if i + 2 >= len(spec["scenes"]) or signature(spec, i) != saved:
                break
            for suffix in ("mp4", "wav"):
                name = f"scene-{i+1:05}.{suffix}"
                shutil.copyfile(self.path / name, destination / name)
            count += 1
        return count

    async def close(self):
        self.closed = True
        tasks = [t for t in (self.preparation, self.renderer) if t]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.temp.cleanup()


@asynccontextmanager
async def streaming_video(**options):
    if not settings.STREAM_VIDEO_SCENES:
        yield None
        return
    work = SceneStream(**options)
    try:
        with work.use():
            yield work
    finally:
        await work.close()
