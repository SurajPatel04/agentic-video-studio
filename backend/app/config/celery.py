"""Celery worker entry point for video jobs."""

from celery import Celery

from app.config import settings

celery_app = Celery(
    "text_to_video",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)
celery_app.conf.update(
    task_default_queue=settings.CELERY_VIDEO_QUEUE,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1,
)
