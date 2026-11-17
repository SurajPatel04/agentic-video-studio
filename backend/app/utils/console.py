"""Readable, coloured console output for the server and the CLI.

    setup_logging()                         # once at startup (main.py / cli.py)

    with step("render", job=job_id) as s:   # ▶ render job=…   …   ✓ render 12.4s job=… video=…
        ...
        s["video"] = "video.mp4"            # fields added here are printed when the step ends

Every line carries the request id (``[a1b2c3]``) of the HTTP request that caused it, so parallel
requests can be told apart. LLM calls are printed by ``LLMLogger`` (attached in ``llm.get_llm``):
the prompt, the reply (text or tool calls), tokens and time.

Settings (.env): LOG_LEVEL (INFO), LOG_PROMPTS (true: print prompts and replies),
LOG_MAX_CHARS (1500 per message), LOG_COLOR (true; off automatically when not a terminal).
Secrets are never printed: only prompts, replies and our own fields.
"""

import logging
import os
import sys
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator
from uuid import UUID

from langchain_core.callbacks import AsyncCallbackHandler

from app.config import settings

request_id: ContextVar[str] = ContextVar("request_id", default="")

_RESET, _DIM, _BOLD = "\033[0m", "\033[2m", "\033[1m"
_C = {"red": "\033[31m", "green": "\033[32m", "yellow": "\033[33m", "blue": "\033[34m",
      "magenta": "\033[35m", "cyan": "\033[36m", "grey": "\033[90m"}
_LEVEL = {"DEBUG": "grey", "INFO": "blue", "WARNING": "yellow", "ERROR": "red", "CRITICAL": "red"}


def _use_color() -> bool:
    return settings.LOG_COLOR and sys.stderr.isatty() and not os.environ.get("NO_COLOR")


def paint(text: str, color: str, bold: bool = False) -> str:
    if not _use_color():
        return text
    return f"{_BOLD if bold else ''}{_C.get(color, '')}{text}{_RESET}"


class PrettyFormatter(logging.Formatter):
    """``12:03:04.120 [a1b2c3] INFO  planner   message`` (multi-line messages stay indented)."""

    def format(self, record: logging.LogRecord) -> str:
        t = time.strftime("%H:%M:%S", time.localtime(record.created)) + f".{int(record.msecs):03d}"
        rid = request_id.get()
        name = record.name.removeprefix("app.").removeprefix("utils.").removeprefix("agent.")
        name = "server" if name.startswith("uvicorn") else name
        head = " ".join([
            paint(t, "grey"),
            paint(f"[{rid}]", "magenta") if rid else paint("[------]", "grey"),
            paint(f"{record.levelname:<5}", _LEVEL.get(record.levelname, "blue"), bold=record.levelno >= logging.WARNING),
            paint(f"{name[:12]:<12}", "cyan"),
        ])
        msg = record.getMessage()
        if record.exc_info:
            msg += "\n" + self.formatException(record.exc_info)
        pad = " " * 42
        return head + " " + msg.replace("\n", "\n" + pad)


_configured = False


def setup_logging(level: str | None = None) -> None:
    """Pretty console logging for our code; quiet for chatty libraries. Safe to call twice."""
    global _configured
    if _configured:
        return
    _configured = True
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(PrettyFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.WARNING)
    logging.getLogger("app").setLevel(level or settings.LOG_LEVEL)
    for noisy in ("httpx", "httpcore", "openai", "urllib3", "langchain", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    for name in ("uvicorn", "uvicorn.error"):  # uvicorn's own lines in the same format
        lg = logging.getLogger(name)
        lg.handlers[:] = []
        lg.propagate = True
        lg.setLevel(logging.INFO)


def short(text: Any, limit: int | None = None) -> str:
    text = str(text)
    limit = limit or settings.LOG_MAX_CHARS
    if len(text) <= limit:
        return text
    return text[:limit] + paint(f" … (+{len(text) - limit} chars)", "grey")


def fmt_seconds(s: float) -> str:
    return f"{s * 1000:.0f}ms" if s < 1 else f"{s:.1f}s" if s < 120 else f"{int(s // 60)}m{int(s % 60):02d}s"


def _fields(fields: dict[str, Any]) -> str:
    return " ".join(f"{paint(k, 'grey')}={short(v, 120)}" for k, v in fields.items() if v not in (None, ""))


def box(title: str, body: str, color: str = "grey") -> str:
    """A titled block for prompts and replies."""
    top = paint(f"┌─ {title} ", color) + paint("─" * max(4, 60 - len(title)), color)
    lines = [paint("│ ", color) + line for line in short(body).splitlines() or [""]]
    return "\n".join([top, *lines, paint("└" + "─" * 63, color)])


@contextmanager
def step(name: str, /, **fields: Any) -> Iterator[dict[str, Any]]:
    """Print the start, end, duration and result fields of one pipeline step (works in async code).
    ``name`` is positional-only, so a field may also be called ``name``."""
    log = logging.getLogger("app.step")
    log.info("%s %s %s", paint("▶", "blue", True), paint(name, "blue", True), _fields(fields))
    result: dict[str, Any] = {}
    started = time.perf_counter()
    try:
        yield result
    except BaseException as exc:
        took = fmt_seconds(time.perf_counter() - started)
        log.error("%s %s %s %s", paint("✗", "red", True), paint(name, "red", True), paint(took, "yellow"),
                  _fields({**fields, **result, "error": f"{type(exc).__name__}: {exc}"}))
        raise
    took = fmt_seconds(time.perf_counter() - started)
    log.info("%s %s %s %s", paint("✓", "green", True), paint(name, "green", True), paint(took, "yellow"), _fields(result))


class LLMLogger(AsyncCallbackHandler):
    """Prints every LLM call: prompt (per message), reply / tool calls, tokens and time."""

    def __init__(self) -> None:
        self.log = logging.getLogger("app.llm")
        self.started: dict[UUID, tuple[float, str]] = {}

    async def on_chat_model_start(self, serialized: dict[str, Any], messages: list[list[Any]], *, run_id: UUID, **kw: Any) -> None:
        model = (kw.get("invocation_params") or {}).get("model") or (kw.get("metadata") or {}).get("ls_model_name") or "?"
        self.started[run_id] = (time.perf_counter(), model)
        msgs = messages[0] if messages else []
        size = sum(len(str(m.content)) for m in msgs)
        self.log.info("%s %s %s", paint("→ LLM", "magenta", True), paint(model, "magenta"),
                      _fields({"messages": len(msgs), "chars": size}))
        if settings.LOG_PROMPTS:
            for m in msgs[-settings.LOG_LAST_MESSAGES:] if len(msgs) > settings.LOG_LAST_MESSAGES else msgs:
                content = m.content if isinstance(m.content, str) else _parts(m.content)
                calls = getattr(m, "tool_calls", None)
                if calls:
                    content += "\n" + "\n".join(f"tool_call {c['name']}({short(c['args'], 200)})" for c in calls)
                self.log.info(box(f"prompt · {m.type}", content, "grey"))
            if len(msgs) > settings.LOG_LAST_MESSAGES:
                self.log.info(paint(f"(only the last {settings.LOG_LAST_MESSAGES} of {len(msgs)} messages shown)", "grey"))

    async def on_llm_end(self, response: Any, *, run_id: UUID, **kw: Any) -> None:
        started, model = self.started.pop(run_id, (time.perf_counter(), "?"))
        gen = response.generations[0][0] if response.generations and response.generations[0] else None
        msg = getattr(gen, "message", None)
        usage = getattr(msg, "usage_metadata", None) or {}
        cached = (usage.get("input_token_details") or {}).get("cache_read", 0)
        reasoning = (usage.get("output_token_details") or {}).get("reasoning", 0)
        self.log.info("%s %s %s %s", paint("← LLM", "green", True), paint(model, "magenta"),
                      paint(fmt_seconds(time.perf_counter() - started), "yellow"),
                      _fields({"in": usage.get("input_tokens"), "cached": cached or None,
                               "out": usage.get("output_tokens"), "reasoning": reasoning or None}))
        if settings.LOG_PROMPTS and msg is not None:
            text = msg.content if isinstance(msg.content, str) else _parts(msg.content)
            calls = getattr(msg, "tool_calls", None) or []
            body = (text or "").strip()
            if calls:
                body += ("\n" if body else "") + "\n".join(f"tool_call {c['name']}({short(c['args'], 300)})" for c in calls)
            self.log.info(box("reply", body or "(empty)", "green"))

    async def on_llm_error(self, error: BaseException, *, run_id: UUID, **kw: Any) -> None:
        started, model = self.started.pop(run_id, (time.perf_counter(), "?"))
        self.log.error("%s %s %s %s", paint("✗ LLM", "red", True), model, fmt_seconds(time.perf_counter() - started),
                       short(f"{type(error).__name__}: {error}", 500))


def _parts(content: list[Any]) -> str:
    """Text of a multi-part message; images shown as a placeholder (never base64)."""
    out = []
    for p in content:
        if isinstance(p, dict) and p.get("type") in ("image_url", "image"):
            out.append("[image]")
        elif isinstance(p, dict):
            out.append(str(p.get("text", "")))
        else:
            out.append(str(p))
    return "\n".join(x for x in out if x)


LLM_LOGGER = LLMLogger()
