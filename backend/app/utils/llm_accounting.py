"""Collect provider usage for one job stage, isolated from concurrent chapters."""
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, computed_field


class ModelRates(BaseModel):
    """USD per million tokens for a model or gateway route."""

    input: Decimal = Field(ge=0, allow_inf_nan=False)
    cached_input: Decimal = Field(ge=0, allow_inf_nan=False)
    output: Decimal = Field(ge=0, allow_inf_nan=False)
    cached_output: Decimal | None = Field(default=None, ge=0, allow_inf_nan=False)


class UsageDetails(BaseModel):
    cached_input_tokens: int = 0
    cached_output_tokens: int = 0
    usage_details_calls: int = 0
    priced_llm_calls: int = 0
    known_llm_cost_usd: float = 0.0

    def add_usage(self, other: "UsageDetails") -> None:
        for field in UsageDetails.model_fields:
            setattr(self, field, getattr(self, field) + getattr(other, field))


class SavedUsage(UsageDetails):
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0

    @computed_field
    @property
    def total_llm_cost_usd(self) -> float | None:
        if self.priced_llm_calls == self.llm_calls:
            return round(self.known_llm_cost_usd, 12)
        return None


@dataclass
class CollectedUsage:
    details: UsageDetails
    input_tokens: int = 0
    output_tokens: int = 0


_active: ContextVar[CollectedUsage | None] = ContextVar("llm_usage", default=None)


@contextmanager
def collect_usage() -> Iterator[CollectedUsage]:
    usage = CollectedUsage(UsageDetails())
    token = _active.set(usage)
    try:
        yield usage
    finally:
        _active.reset(token)


def record_usage(message: Any, usage: dict, rates: dict[str, ModelRates]) -> None:
    collected = _active.get()
    if collected is None:
        return
    details = collected.details
    inputs, outputs = int(usage.get("input_tokens") or 0), int(usage.get("output_tokens") or 0)
    cached_in = int((usage.get("input_token_details") or {}).get("cache_read") or 0)
    cached_out = int((usage.get("output_token_details") or {}).get("cache_read") or 0)
    collected.input_tokens += inputs
    collected.output_tokens += outputs
    details.usage_details_calls += 1
    details.cached_input_tokens += cached_in
    details.cached_output_tokens += cached_out
    metadata = getattr(message, "response_metadata", None) or {}
    cost = next((p["cost_usd"] for p in (usage, metadata, metadata.get("token_usage") or {})
                 if isinstance(p.get("cost_usd"), (int, float))), None)
    model = metadata.get("model_name") or metadata.get("model")
    rate = rates.get(model)
    if (cost is None and rate and "input_tokens" in usage and "output_tokens" in usage
            and (not cached_out or rate.cached_output is not None)):
        input_cost = max(0, inputs - cached_in) * rate.input + cached_in * rate.cached_input
        output_cost = max(0, outputs - cached_out) * rate.output + cached_out * (rate.cached_output or 0)
        cost = float((input_cost + output_cost) / 1_000_000)
    if cost is not None and 0 <= cost < float("inf"):
        details.priced_llm_calls += 1
        details.known_llm_cost_usd += cost
