"""Celery tasks: every video and component agent job runs here, never inside the API."""

import asyncio
import logging

from app.agent.videoGenerator.jobs.component_jobs import run_queued_component
from app.agent.videoGenerator.jobs.video_jobs import run_queued_video
from app.config.celery import celery_app
from app.config import settings


@celery_app.task(acks_late=True, reject_on_worker_lost=True)
def generate_video(job_id: str, request: dict, length: str) -> None:
    # Celery owns the handlers and redirects stdout/stderr into its logger.
    logging.getLogger("app").setLevel(settings.LOG_LEVEL)
    asyncio.run(run_queued_video(job_id, request, length))


@celery_app.task(acks_late=True, reject_on_worker_lost=True)
def build_component_job(job_id: str, request: dict) -> None:
    logging.getLogger("app").setLevel(settings.LOG_LEVEL)
    asyncio.run(run_queued_component(job_id, request))
