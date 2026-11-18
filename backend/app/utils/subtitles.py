"""Subtitle files and a switchable subtitle track from the narration's word timings.

The renderer can burn styled captions into the picture; a player cannot switch those off. This module
writes the same lines as ``captions.srt`` / ``captions.vtt`` and muxes them into the MP4 as a subtitle
track (mov_text), which every common player (VLC, mpv, QuickTime, phones) can switch on and off.
It also writes ``transcript.json`` (scene by scene, sentences with start/end seconds) and ``transcript.txt``.

Caption mode (JSON ``"captions": {"mode": ...}``, else burn, or both with ``CAPTIONS_PLAYER_TRACK``):
  burn  - styled captions in the picture (current word in the highlight colour); no track
  track - no captions in the picture; a subtitle track the viewer switches on / off (on by default)
  both  - styled captions in the picture + the track (off by default)
Timing mirrors rendering/src/audio/Captions.tsx (same line breaks) and the scene start frames of
rendering/src/VideoComposition.tsx (transitions overlap, brand intro shifts everything).
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MODES = ("burn", "track", "both")
HANDOFF = 12  # frames the brand intro overlaps the first scene (rendering/src/brand.tsx)


@dataclass
class Cue:
    start: float  # seconds
    end: float
    text: str


def caption_mode(spec: dict[str, Any], default: str = "burn") -> str:
    c = spec.get("captions")
    mode = c.get("mode") if isinstance(c, dict) else None
    return mode if mode in MODES else default


def _transition_frames(spec: dict[str, Any], i: int) -> int:
    """Same as transitionFrames() in rendering/src/transitions.ts."""
    if i <= 0:
        return 0
    scenes = spec["scenes"]
    t = scenes[i].get("transition") or spec.get("defaultTransition") or {"type": "none"}
    if t.get("type") == "none":
        return 0
    wanted = int(t.get("durationInFrames", 15))
    return max(0, min(wanted, int(scenes[i - 1]["durationInFrames"]) - 1, int(scenes[i]["durationInFrames"]) - 1))


def _brand_offset(spec: dict[str, Any], fps: int) -> int:
    """Frames before the first scene starts (brandTiming() in rendering/src/brand.tsx)."""
    b = spec.get("brand", True)
    if b is False:
        return 0
    b = b if isinstance(b, dict) else {}
    if not b.get("intro", True):
        return 0
    return round(float(b.get("introSeconds", 3)) * fps) - HANDOFF


def _lines(words: list[dict], max_words: int, fps: int) -> list[list[dict]]:
    """Same line breaks as toLines() in Captions.tsx: max words, sentence end, or a pause > 0.5 s."""
    lines, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        sentence_end = re.search(r"[.!?][\"')]?$", w["t"]) is not None
        pause = (nxt["s"] - w["e"] > fps * 0.5) if nxt else True
        if len(cur) >= max_words or sentence_end or pause:
            lines.append(cur)
            cur = []
    if cur:
        lines.append(cur)
    return lines


def _scene_starts(spec: dict[str, Any], fps: int) -> list[int]:
    """Frame each scene starts at in the final video (sceneStarts() in VideoComposition.tsx + brand intro)."""
    scenes = spec.get("scenes") or []
    starts, start = [], _brand_offset(spec, fps)
    for i in range(len(scenes)):
        if i > 0:
            start += int(scenes[i - 1]["durationInFrames"]) - _transition_frames(spec, i)
        starts.append(start)
    return starts


def cues(spec: dict[str, Any]) -> list[Cue]:
    fps = int(spec.get("fps", 30))
    c = spec.get("captions")
    max_words = int(c.get("maxWords", 7)) if isinstance(c, dict) else 7
    scenes = spec.get("scenes") or []
    out: list[Cue] = []
    for sc, start in zip(scenes, _scene_starts(spec, fps)):
        words = ((sc.get("voice") or {}).get("words")) or []
        lines = _lines(words, max_words, fps)
        for k, line in enumerate(lines):
            a = line[0]["s"] - 3
            if k + 1 < len(lines):
                b = min(lines[k + 1][0]["s"] - 3, line[-1]["e"] + fps)
            else:
                b = line[-1]["e"] + round(fps * 0.6)
            out.append(Cue((start + a) / fps, (start + b) / fps, " ".join(w["t"] for w in line)))
    for prev, nxt in zip(out, out[1:]):  # never overlap across a scene cut
        prev.end = min(prev.end, nxt.start)
    return [q for q in out if q.end > q.start]


def _stamp(sec: float, sep: str) -> str:
    ms = max(0, round(sec * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}{sep}{ms % 1000:03d}"


def to_srt(items: list[Cue]) -> str:
    return "".join(f"{n}\n{_stamp(q.start, ',')} --> {_stamp(q.end, ',')}\n{q.text}\n\n" for n, q in enumerate(items, 1))


def to_vtt(items: list[Cue]) -> str:
    return "WEBVTT\n\n" + "".join(f"{_stamp(q.start, '.')} --> {_stamp(q.end, '.')}\n{q.text}\n\n" for q in items)


def parse_srt(text: str) -> list[Cue]:
    def sec(s: str) -> float:
        h, m, rest = s.strip().split(":")
        s_, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s_) + int(ms) / 1000

    items = []
    for block in re.split(r"\n\s*\n", text.strip()):
        rows = block.strip().splitlines()
        if len(rows) >= 3 and "-->" in rows[1]:
            a, b = rows[1].split("-->")
            items.append(Cue(sec(a), sec(b), "\n".join(rows[2:])))
    return items


def write_files(items: list[Cue], folder: Path, name: str = "captions") -> tuple[Path, Path]:
    srt, vtt = folder / f"{name}.srt", folder / f"{name}.vtt"
    srt.write_text(to_srt(items))
    vtt.write_text(to_vtt(items))
    return srt, vtt


# --------------------------------------------------------------------------- transcript


def transcript(spec: dict[str, Any], offset: float = 0.0, chapter: int | None = None) -> list[dict[str, Any]]:
    """What is said, scene by scene, with times in seconds from the start of the video (``offset`` shifts
    a chapter to where it starts in a long video). Each scene lists its sentences with their own times."""
    fps = int(spec.get("fps", 30))
    out: list[dict[str, Any]] = []
    for sc, start in zip(spec.get("scenes") or [], _scene_starts(spec, fps)):
        words = ((sc.get("voice") or {}).get("words")) or []
        if not words:
            continue
        at = lambda frame: round(offset + (start + frame) / fps, 2)  # noqa: E731
        sentences, cur = [], []
        for i, w in enumerate(words):
            cur.append(w)
            if re.search(r"[.!?][\"')]?$", w["t"]) or i + 1 == len(words):
                sentences.append({"start": at(cur[0]["s"]), "end": at(cur[-1]["e"]), "text": " ".join(x["t"] for x in cur)})
                cur = []
        item = {"scene": sc.get("id"), "component": sc.get("component"), "start": at(words[0]["s"]), "end": at(words[-1]["e"]),
                "text": " ".join(s["text"] for s in sentences), "sentences": sentences}
        out.append({"chapter": chapter, **item} if chapter is not None else item)
    return out


def _clock(sec: float) -> str:
    s = int(sec)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


def to_txt(items: list[dict[str, Any]], chapters: list[str] | None = None) -> str:
    """Readable transcript: one sentence per line with its time, a blank line between scenes and a
    heading per chapter (``chapters`` = titles, for a long video)."""
    out, last = [], None
    for item in items:
        ch = item.get("chapter")
        if chapters and ch is not None and ch != last:
            title = chapters[ch - 1] if 0 < ch <= len(chapters) else ""
            out += ["", f"## Chapter {ch}: {title}".rstrip(": ")] if out else [f"## Chapter {ch}: {title}".rstrip(": ")]
            last = ch
        out.append("")
        out += [f"[{_clock(s['start'])}] {s['text']}" for s in item["sentences"]]
    return "\n".join(out).strip() + "\n"


def write_transcript(items: list[dict[str, Any]], folder: Path, chapters: list[str] | None = None) -> tuple[Path, Path]:
    js, txt = folder / "transcript.json", folder / "transcript.txt"
    js.write_text(json.dumps(items, indent=2, ensure_ascii=False))
    txt.write_text(to_txt(items, chapters))
    return js, txt


def mux_args(video_in: Path, srt: Path, video_out: Path, *, shown: bool, language: str = "eng") -> list[str]:
    """ffmpeg command: copy picture and sound, add the subtitles as a switchable track."""
    return ["ffmpeg", "-y", "-i", str(video_in), "-i", str(srt), "-map", "0:v", "-map", "0:a?", "-map", "1:0",
            "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text",
            "-metadata:s:s:0", f"language={language}", "-metadata:s:s:0", "title=Captions",
            "-disposition:s:0", "default" if shown else "0", "-movflags", "+faststart", str(video_out)]
