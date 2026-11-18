"""Text-to-speech through Deepgram (narration audio for the videos).

Clips are WAV (16-bit mono PCM) saved in ``rendering/public/audio/tts/<hash>.wav`` so Remotion
can play them with ``staticFile("audio/tts/<hash>.wav")``. The hash covers voice + text, so the
same sentence is never requested twice.
"""

import asyncio
import difflib
import hashlib
import json
import logging
import re
import struct
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from app.config import settings
from app.utils.console import fmt_seconds, short

log = logging.getLogger(__name__)

TTS_DIR_IN_PUBLIC = "audio/tts"  # path Remotion sees (relative to rendering/public)
MAX_CHARS = 2000  # Deepgram's limit per request


@dataclass(frozen=True)
class SpeechClip:
    path: Path  # file on disk
    src: str  # path for the composition JSON (relative to rendering/public)
    seconds: float
    cached: bool


def tts_dir() -> Path:
    return settings.RENDERING_DIR / "public" / TTS_DIR_IN_PUBLIC


def clip_name(text: str, voice: str) -> str:
    return hashlib.sha1(f"{voice}\n{text}".encode()).hexdigest()[:16] + ".wav"


def wav_seconds(data: bytes) -> float:
    """Length of a PCM WAV. Reads the real ``data`` chunk and tolerates streamed headers."""
    rate, bytes_per_frame = settings.TTS_SAMPLE_RATE, 2
    i = 12
    while i + 8 <= len(data):
        chunk_id = data[i : i + 4]
        (size,) = struct.unpack_from("<I", data, i + 4)
        if chunk_id == b"fmt ":
            channels, rate = struct.unpack_from("<HI", data, i + 10)
            (bits,) = struct.unpack_from("<H", data, i + 22)
            bytes_per_frame = channels * bits // 8
        elif chunk_id == b"data":
            available = len(data) - (i + 8)
            n = available if size in (0, 0xFFFFFFFF) or size > available else size
            return n / bytes_per_frame / rate
        i += 8 + size + (size % 2)
    return max(0, len(data) - 44) / 2 / settings.TTS_SAMPLE_RATE


_deepgram_slots: dict[int, asyncio.Semaphore] = {}


def _slots() -> asyncio.Semaphore:
    """At most DEEPGRAM_CONCURRENCY requests in flight (a chapter has ~25 clips; firing them all at once
    gets 429 Too Many Requests). One semaphore per event loop (a semaphore cannot be shared across loops)."""
    loop = id(asyncio.get_running_loop())
    if loop not in _deepgram_slots:
        _deepgram_slots[loop] = asyncio.Semaphore(max(1, settings.DEEPGRAM_CONCURRENCY))
    return _deepgram_slots[loop]


async def _post(what: str, url: str, **kwargs: Any) -> httpx.Response:
    """POST to Deepgram, limited and retried: 429 / 5xx / network errors wait (Retry-After, else 2, 4, 8, ...
    seconds) and try again, up to DEEPGRAM_RETRIES times."""
    tries = max(1, settings.DEEPGRAM_RETRIES)
    async with _slots(), httpx.AsyncClient(timeout=settings.TTS_TIMEOUT_SECONDS) as client:
        for attempt in range(1, tries + 1):
            try:
                res = await client.post(url, **kwargs)
            except httpx.TransportError as exc:
                if attempt == tries:
                    raise RuntimeError(f"Deepgram {what}: {exc}") from exc
                await asyncio.sleep(min(30, 2 ** attempt))
                continue
            if res.status_code == 200:
                return res
            if not (res.status_code == 429 or res.status_code >= 500) or attempt == tries:
                raise RuntimeError(f"Deepgram {what} {res.status_code}: {res.text[:300]}")
            wait = res.headers.get("retry-after", "")
            delay = float(wait) if wait.replace(".", "", 1).isdigit() else min(30, 2 ** attempt)
            log.warning("deepgram.%s.retry status=%s attempt=%d wait_s=%.0f", what.lower(), res.status_code, attempt, delay)
            await asyncio.sleep(delay)
    raise RuntimeError("unreachable")


async def _request(text: str, voice: str) -> bytes:
    if not settings.DEEPGRAM_TTS_API_KEY:
        raise RuntimeError("Set DEEPGRAM_TTS_API_KEY in .env")
    params = {"model": voice, "encoding": "linear16", "container": "wav", "sample_rate": settings.TTS_SAMPLE_RATE}
    headers = {"Authorization": f"Token {settings.DEEPGRAM_TTS_API_KEY}", "Content-Type": "application/json"}
    return (await _post("TTS", settings.DEEPGRAM_TTS_URL, params=params, headers=headers, json={"text": text})).content


async def synthesize(text: str, voice: str | None = None) -> SpeechClip:
    """Speak ``text`` with Deepgram (or reuse the cached clip) and return the WAV clip."""
    text = " ".join(text.split())
    if not text:
        raise ValueError("text is empty")
    if len(text) > MAX_CHARS:
        raise ValueError(f"text is {len(text)} characters; Deepgram allows {MAX_CHARS} per clip")
    voice = voice or settings.TTS_VOICE
    name = clip_name(text, voice)
    path = tts_dir() / name
    src = f"{TTS_DIR_IN_PUBLIC}/{name}"
    if path.exists():
        return SpeechClip(path, src, wav_seconds(path.read_bytes()), cached=True)

    started = time.perf_counter()
    data = await _request(text, voice)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    seconds = wav_seconds(data)
    log.info("tts  %s  audio=%.1fs chars=%d voice=%s  “%s”", fmt_seconds(time.perf_counter() - started), seconds, len(text), voice, short(text, 90))
    return SpeechClip(path, src, seconds, cached=False)


# --------------------------------------------------------------------- word timings


@dataclass(frozen=True)
class Word:
    text: str
    start: float  # seconds from the start of the clip
    end: float


async def _transcribe(data: bytes) -> list[dict]:
    key = settings.DEEPGRAM_STT_API_KEY or settings.DEEPGRAM_TTS_API_KEY
    if not key:
        raise RuntimeError("no Deepgram key")
    params = {"model": settings.STT_MODEL, "punctuate": "true", "smart_format": "false"}
    headers = {"Authorization": f"Token {key}", "Content-Type": "audio/wav"}
    res = await _post("STT", settings.DEEPGRAM_STT_URL, params=params, headers=headers, content=data)
    return res.json()["results"]["channels"][0]["alternatives"][0]["words"]


def _estimate(text: str, seconds: float) -> list[Word]:
    """No timings available: spread the words over the clip by length (longer words take longer)."""
    tokens = text.split()
    weights = [len(t) + 2 for t in tokens]
    total = sum(weights) or 1
    lead, usable = 0.15, max(0.1, seconds - 0.35)
    words, t = [], lead
    for tok, w in zip(tokens, weights):
        d = usable * w / total
        words.append(Word(tok, round(t, 3), round(t + d, 3)))
        t += d
    return words


def _norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


def align(tokens: list[str], heard: list[dict]) -> list[Word]:
    """Timings from the transcript, spelling from the narration.

    Speech-to-text writes what it heard ("refile" for "readFile", "1" for "one"), so captions always
    show the narration's own words: matching words take their heard times; a mismatched stretch
    (e.g. narration "readFile" vs heard "read", "file") shares the heard stretch's time span; a word
    nobody heard gets a slot between its neighbours.
    """
    said = [(_norm(h.get("word") or h.get("punctuated_word") or ""), float(h["start"]), float(h["end"])) for h in heard]
    times: list[tuple[float, float] | None] = [None] * len(tokens)
    sm = difflib.SequenceMatcher(a=[_norm(t) for t in tokens], b=[s[0] for s in said], autojunk=False)
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op == "equal":
            for k in range(a1 - a0):
                times[a0 + k] = (said[b0 + k][1], said[b0 + k][2])
        elif op == "replace":  # share the heard span by word length
            start, end = said[b0][1], said[b1 - 1][2]
            weights = [len(t) + 1 for t in tokens[a0:a1]]
            t = start
            for k, w in enumerate(weights):
                d = (end - start) * w / sum(weights)
                times[a0 + k] = (t, t + d)
                t += d
    # words that were not heard at all: squeeze between the neighbours' times
    i = 0
    while i < len(times):
        if times[i] is not None:
            i += 1
            continue
        j = i
        while j < len(times) and times[j] is None:
            j += 1
        prev = times[i - 1][1] if i > 0 else said[0][1]  # type: ignore[index]
        nxt = times[j][0] if j < len(times) else said[-1][2]  # type: ignore[index]
        d = max(0.05, (nxt - prev) / (j - i))
        for k in range(i, j):
            times[k] = (prev + (k - i) * d, prev + (k - i + 1) * d)
        i = j
    return [Word(tok, round(s, 3), round(max(e, s + 0.05), 3)) for tok, (s, e) in zip(tokens, times)]  # type: ignore[misc]


async def word_timings(clip: SpeechClip, text: str) -> list[Word]:
    """When each word is spoken in ``clip``. Uses Deepgram speech-to-text on the clip (cached next to it).

    Shows the original narration words (so spelling matches what was written) whenever the
    transcript has the same number of words; otherwise the transcript's own words.
    """
    text = " ".join(text.split())
    cache = clip.path.with_suffix(".words-v2.json")  # v2: narration spelling (align)
    if cache.exists():
        return [Word(**w) for w in json.loads(cache.read_text())]
    try:
        started = time.perf_counter()
        heard = await _transcribe(clip.path.read_bytes())
        log.info("stt  %s  words=%d (for captions)", fmt_seconds(time.perf_counter() - started), len(heard))
        if not heard:
            raise RuntimeError("empty transcript")
        words = align(text.split(), heard)
    except Exception as exc:  # captions must never break a render
        log.warning("tts.words.estimate reason=%s", exc)
        words = _estimate(text, clip.seconds)
    cache.write_text(json.dumps([w.__dict__ for w in words]))
    return words
