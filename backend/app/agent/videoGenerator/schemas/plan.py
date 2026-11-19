from dataclasses import dataclass, field
from typing import Any


@dataclass
class Plan:
    spec: dict[str, Any]
    attempts: int
    mode: str
    llm_calls: int
    input_tokens: int
    output_tokens: int
    skills: list[str] = field(default_factory=list)
