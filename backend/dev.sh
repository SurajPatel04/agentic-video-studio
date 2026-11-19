#!/usr/bin/env bash
# Start the API and Celery together for local testing.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

export LLM_PROFILE="${LLM_PROFILE:-test}"
export VIDEO_JOB_RUNNER=celery
export CELERY_VIDEO_QUEUE="${CELERY_VIDEO_QUEUE:-video-test}"

pids=()
cleanup() {
    if (( ${#pids[@]} )); then
        kill -TERM "${pids[@]}" 2>/dev/null || true
        wait "${pids[@]}" 2>/dev/null || true
    fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

../.venv/bin/celery -A app.config.celery:celery_app worker \
    --loglevel=INFO --concurrency="${CELERY_WORKERS:-2}" --hostname="video-dev-$$@%h" &
pids+=("$!")

../.venv/bin/uvicorn app.main:app --port "${PORT:-8000}" &
pids+=("$!")

wait -n "${pids[@]}"
