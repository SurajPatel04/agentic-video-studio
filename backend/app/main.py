import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI

from app.api.routes import cancel, components, health, skills, videos
from app.config import settings
from app.middleware.request_log import RequestLog
from app.utils.console import paint, setup_logging
from app.utils.llm import resolve_base_url

setup_logging()
log = logging.getLogger("app.http")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if settings.LLM_PROFILE == "test":
        host, model = "OpenAI (TEST key)", settings.TEST_MODEL
    else:
        # The gateway URL can contain credentials.
        host = urlparse(resolve_base_url()).hostname or "?"
        model = settings.PLANNER_MODEL or settings.DEFAULT_MODEL
    log.info(
        "%s  llm=%s via %s  planner=%s  prompts=%s  level=%s",
        paint("Agentic Video Studio ready", "green", True),
        model,
        host,
        settings.PLANNER_MODE,
        "on" if settings.LOG_PROMPTS else "off",
        settings.LOG_LEVEL,
    )
    yield


app = FastAPI(title="Agentic Video Studio API", lifespan=lifespan)
app.add_middleware(RequestLog)
app.include_router(health.router)
app.include_router(skills.router)
app.include_router(videos.router)
app.include_router(components.router)
app.include_router(cancel.router)
