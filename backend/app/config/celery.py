"""Celery worker entry point for video jobs.

One task = one whole video (skill choice, planning, voice, render), run by one worker process.
CELERY_WORKERS processes run at once; each takes one job at a time and asks for the next only when done.
"""

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
    task_ignore_result=True,  # status, progress and logs live in workspace/ and the job Redis keys
    result_expires=settings.JOB_TTL_SECONDS,
    worker_concurrency=settings.CELERY_WORKERS,
    worker_prefetch_multiplier=1,  # a process reserves only the job it runs
    worker_max_tasks_per_child=settings.CELERY_JOBS_PER_PROCESS or None,
    broker_connection_retry_on_startup=True,
    broker_connection_timeout=3,
    broker_transport_options={"visibility_timeout": settings.CELERY_VISIBILITY_TIMEOUT, "max_retries": 0,
                              "socket_connect_timeout": 3},
)
