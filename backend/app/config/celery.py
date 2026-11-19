"""Celery worker entry point for video jobs."""

from celery import Celery

from app.config import settings

celery_app = Celery(
    "text_to_video",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.agent.videoGenerator.jobs.tasks"],
)
celery_app.conf.update(
    task_default_queue=settings.CELERY_VIDEO_QUEUE,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1,
    broker_connection_timeout=3,
    broker_transport_options={"visibility_timeout": settings.CELERY_VISIBILITY_TIMEOUT, "max_retries": 0, "socket_connect_timeout": 3},
    result_backend_transport_options={"visibility_timeout": settings.CELERY_VISIBILITY_TIMEOUT},
    visibility_timeout=settings.CELERY_VISIBILITY_TIMEOUT,
)
