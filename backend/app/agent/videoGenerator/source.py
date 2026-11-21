"""User-supplied source material ("source" on /videos, --source in the CLI): the video's only facts."""
from app.config import settings

SOURCE_RULES = """SOURCE MATERIAL: the user supplied the content below. Build the video from it.
- Use only the facts, names, numbers, dates, quotes, examples and claims in the source. Do not add outside facts,
  statistics, products, people or events. You may explain, simplify, reorder and summarize it, define its terms in
  plain words, and use an everyday analogy that you present as an analogy.
- If the source has a clear factual error, a wrong calculation or a contradiction, do not repeat it as true:
  state the correct fact briefly instead (or leave the point out when you are not sure what is correct).
- If the brief asks for something the source does not cover, keep to what the source supports.
- The brief decides format, tone, audience and length; the source decides the content.
<source>
{source}
</source>
"""


def clean_source(source: str | None) -> str:
    """The source text, trimmed ("" when none). Raises ValueError when it is over SOURCE_MAX_CHARS."""
    text = (source or "").strip()
    if len(text) > settings.SOURCE_MAX_CHARS:
        raise ValueError(f"source is {len(text)} characters; the limit is SOURCE_MAX_CHARS={settings.SOURCE_MAX_CHARS}")
    return text


def source_context(source: str | None) -> str:
    """The planner instructions plus the source, or "" when there is no source."""
    text = clean_source(source)
    return "\n" + SOURCE_RULES.format(source=text) if text else ""
