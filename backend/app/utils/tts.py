"""Text-to-speech through Deepgram (narration audio for the videos).

Clips are WAV (16-bit mono PCM) saved in ``rendering/public/audio/tts/<hash>.wav`` so Remotion
can play them with ``staticFile("audio/tts/<hash>.wav")``. The hash covers voice + text, so the
same sentence is never requested twice.
"""

import asyncio
import hashlib
import json
import logging
import struct
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.config import settings

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


async def _request(text: str, voice: str) -> bytes:
    if not settings.DEEPGRAM_TTS_API_KEY:
        raise RuntimeError("Set DEEPGRAM_TTS_API_KEY in .env")
    params = {"model": voice, "encoding": "linear16", "container": "wav", "sample_rate": settings.TTS_SAMPLE_RATE}
    headers = {"Authorization": f"Token {settings.DEEPGRAM_TTS_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=settings.TTS_TIMEOUT_SECONDS) as client:
        for attempt in range(1, 4):
            res = await client.post(settings.DEEPGRAM_TTS_URL, params=params, headers=headers, json={"text": text})
            if res.status_code == 200:
                return res.content
            retry = res.status_code == 429 or res.status_code >= 500
            if not retry or attempt == 3:
                raise RuntimeError(f"Deepgram TTS {res.status_code}: {res.text[:300]}")
            await asyncio.sleep(attempt)
    raise RuntimeError("unreachable")


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
    log.info("tts.ok voice=%s chars=%d audio_s=%.1f duration_ms=%.0f", voice, len(text), seconds, (time.perf_counter() - started) * 1000)
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
    async with httpx.AsyncClient(timeout=settings.TTS_TIMEOUT_SECONDS) as client:
        res = await client.post(settings.DEEPGRAM_STT_URL, params=params, headers=headers, content=data)
    if res.status_code != 200:
        raise RuntimeError(f"Deepgram STT {res.status_code}: {res.text[:200]}")
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


async def word_timings(clip: SpeechClip, text: str) -> list[Word]:
    """When each word is spoken in ``clip``. Uses Deepgram speech-to-text on the clip (cached next to it).

    Shows the original narration words (so spelling matches what was written) whenever the
    transcript has the same number of words; otherwise the transcript's own words.
    """
    text = " ".join(text.split())
    cache = clip.path.with_suffix(".words.json")
    if cache.exists():
        return [Word(**w) for w in json.loads(cache.read_text())]
    try:
        heard = await _transcribe(clip.path.read_bytes())
        tokens = text.split()
        if len(heard) == len(tokens):
            words = [Word(tok, round(h["start"], 3), round(h["end"], 3)) for tok, h in zip(tokens, heard)]
        else:
            words = [Word(h.get("punctuated_word") or h["word"], round(h["start"], 3), round(h["end"], 3)) for h in heard]
        if not words:
            raise RuntimeError("empty transcript")
    except Exception as exc:  # captions must never break a render
        log.warning("tts.words.estimate reason=%s", exc)
        words = _estimate(text, clip.seconds)
    cache.write_text(json.dumps([w.__dict__ for w in words]))
    return words
