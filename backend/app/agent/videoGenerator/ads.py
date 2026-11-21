"""Ads: a short video planned with the make-ad guide, at most AD_MAX_MINUTES long."""
from app.config import settings

AD_SKILL = "make-ad"


def ad_minutes(minutes: float | None = None) -> float:
    """An ad's length: the minutes asked for (else AD_DEFAULT_MINUTES), never more than AD_MAX_MINUTES."""
    return min(minutes or settings.AD_DEFAULT_MINUTES, settings.AD_MAX_MINUTES)


def ad_brief(minutes: float | None, scenes: int | None) -> tuple[int, int, str]:
    """(scenes, narration words, planner note) for an ad of ``minutes``."""
    m = ad_minutes(minutes)
    words = max(20, round(m * settings.LONG_WORDS_PER_MINUTE))
    scenes = scenes or max(3, round(words / settings.LONG_WORDS_PER_SCENE))
    length = f"{round(m * 60)} seconds" if m < 1 else f"{m:g} minute{'s' if m != 1 else ''}"
    note = (f"- This video is an advertisement (promo), about {length} long; never longer than "
            f"{settings.AD_MAX_MINUTES:g} minutes. Follow the make-ad guide.\n")
    return scenes, words, note
