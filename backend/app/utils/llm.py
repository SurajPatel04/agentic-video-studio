"""LLM access through the MLflow AI Gateway (OpenAI-compatible).

Ported from landnextrole-discovery-chat-agent-service/src/discovery_service/llm/gateway.py.
"""

import base64
import logging
import time
from typing import Any
from urllib.parse import urlparse

from langchain_openai import ChatOpenAI

from app.config import settings
from app.utils.console import LLM_LOGGER

log = logging.getLogger(__name__)

# ChatOpenAI requires a non-empty key. Gateway auth is the Basic header built
# from the username and password in MLFLOW_TRACKING_URI.
_GATEWAY_API_KEY = "not-needed"
_LLM_CACHE: dict[tuple, ChatOpenAI] = {}


def _normalize_base_url(raw: str) -> str | None:
    base_url = raw.strip().rstrip("/")
    suffix = "/chat/completions"
    if base_url.endswith(suffix):
        base_url = base_url[: -len(suffix)]
    return base_url or None


def resolve_base_url() -> str:
    configured = _normalize_base_url(settings.MLFLOW_GATEWAY_BASE_URL)
    if configured:
        return configured

    uri = urlparse(settings.MLFLOW_TRACKING_URI)
    if not (uri.scheme and uri.hostname):
        raise RuntimeError("Set MLFLOW_TRACKING_URI (or MLFLOW_GATEWAY_BASE_URL) in .env")
    host = f"{uri.hostname}:{uri.port}" if uri.port else uri.hostname
    path = uri.path.rstrip("/")
    if path.endswith(("/gateway/openai/v1", "/gateway/mlflow/v1")):
        return f"{uri.scheme}://{host}{path}"
    return f"{uri.scheme}://{host}{path}/gateway/openai/v1"


def resolve_headers() -> dict[str, str] | None:
    uri = urlparse(settings.MLFLOW_TRACKING_URI)
    if not (uri.username and uri.password):
        return None
    token = base64.b64encode(f"{uri.username}:{uri.password}".encode()).decode("ascii")
    return {"Authorization": f"Basic {token}"}


def get_llm(model: str | None = None, **kwargs: Any) -> ChatOpenAI:
    """Return a cached ChatOpenAI client pointed at the MLflow gateway route ``model``."""
    resolved_model = model or settings.DEFAULT_MODEL
    test = settings.LLM_PROFILE == "test"
    if test:  # gateway route names mean nothing on OpenAI: always the test model
        resolved_model = settings.TEST_MODEL
    key = (settings.LLM_PROFILE, resolved_model, tuple(sorted(kwargs.items())))
    if key not in _LLM_CACHE:
        kwargs.setdefault("timeout", settings.LLM_TIMEOUT_SECONDS)
        kwargs.setdefault("callbacks", [LLM_LOGGER])  # prints prompt, reply, tokens, time
        if test:
            if not settings.TEST:
                raise RuntimeError("LLM_PROFILE=test but TEST (OpenAI key) is not set in .env")
            _LLM_CACHE[key] = ChatOpenAI(api_key=settings.TEST, model=resolved_model, **kwargs)
            return _LLM_CACHE[key]
        _LLM_CACHE[key] = ChatOpenAI(
            api_key=_GATEWAY_API_KEY,
            base_url=resolve_base_url(),
            model=resolved_model,
            default_headers=resolve_headers(),
            **kwargs,
        )
    return _LLM_CACHE[key]


async def call_model(prompt: Any, model: str | None = None, **kwargs: Any) -> str:
    """Send ``prompt`` (a string or list of messages) and return the text reply."""
    llm = get_llm(model, **kwargs)
    started = time.perf_counter()
    try:
        response = await llm.ainvoke(prompt)
    except Exception:
        log.exception("llm.call.failed model=%s", llm.model_name)
        raise
    log.info(
        "llm.call.succeeded model=%s duration_ms=%.0f",
        llm.model_name,
        (time.perf_counter() - started) * 1000,
    )
    return response.text if hasattr(response, "text") else str(response.content)


def get_tool_llm(model: str | None = None, **kwargs: Any) -> ChatOpenAI:
    """Client for tool calling. gpt-6-luna only allows tools with reasoning on the Responses API
    (/v1/responses); on /chat/completions it needs reasoning_effort="none"."""
    return get_llm(model, use_responses_api=True, **kwargs)


def usage_of(message: Any) -> tuple[int, int]:
    """(input tokens, output tokens) of an LLM reply, 0 when unknown."""
    u = getattr(message, "usage_metadata", None) or {}
    return int(u.get("input_tokens", 0)), int(u.get("output_tokens", 0))


def text_of(message: Any) -> str:
    t = getattr(message, "text", None)
    if isinstance(t, str):  # newer langchain: property (a str)
        return str(t)
    if callable(t):
        return t()
    return str(message.content)
