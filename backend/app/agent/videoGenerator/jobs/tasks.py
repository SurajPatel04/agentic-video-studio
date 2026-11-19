"""Celery tasks for the unified video API."""

import asyncio

from app.agent.videoGenerator.jobs.video_jobs import run_queued_video
from app.config.celery import celery_app
from app.utils.console import setup_logging


@celery_app.task(acks_late=True, reject_on_worker_lost=True)
def generate_video(job_id: str, request: dict, length: str) -> None:
    setup_logging()
    asyncio.run(run_queued_video(job_id, request, length))
