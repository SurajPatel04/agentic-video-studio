import asyncio
import json
import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.utils import ids
from app.utils.console import fmt_seconds, paint, request_id


log = logging.getLogger("app.http")

# Requests being answered by this server process, by request id (for POST /cancel/{id}).
_active: dict[str, asyncio.Task] = {}
_cancelled: set[str] = set()


def cancel_request(rid: str) -> bool:
    """Stop an in-flight request in this server process. Return False if it has already ended or is unknown."""
    task = _active.get(rid)
    if task is None or task.done() or task is asyncio.current_task():
        return False
    _cancelled.add(rid)
    task.cancel()
    return True


class RequestLog:
    """Log request IDs, statuses, and durations through the ASGI send hook.

    Every request has an id: the client's X-Request-ID header (letters, digits, - and _, up to 64) or a new
    UUID4. It is returned in the X-Request-ID response header. A client that sends its own id can stop the
    request while it runs with POST /cancel/{id}; it then gets 499 {"detail": "request cancelled"}."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        sent = headers.get(b"x-request-id", b"").decode(errors="ignore")
        rid = sent if ids.REQUEST_ID_RE.fullmatch(sent) else ids.new_id()
        token = request_id.set(rid)
        method, path = scope["method"], scope["path"]
        query = scope.get("query_string")
        if query:
            path = f"{path}?{query.decode()}"
        started, status, response_started = time.perf_counter(), 500, False

        async def send_with_id(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status, response_started = message["status"], True
                message["headers"] = [*message.get("headers", []), (b"x-request-id", rid.encode())]
            await send(message)

        log.info("%s %s %s", paint("→", "blue", True), paint(method, "blue", True), path)
        task = asyncio.current_task()
        if task is not None:
            _active[rid] = task
        try:
            await self.app(scope, receive, send_with_id)
        except asyncio.CancelledError:
            if rid not in _cancelled:
                raise  # the server is stopping or the client went away
            task.uncancel()
            status = 499
            log.warning("%s %s %s %s", paint("✗ 499 cancelled", "yellow", True), method, path,
                        paint(fmt_seconds(time.perf_counter() - started), "yellow"))
            if not response_started:
                await send_with_id({"type": "http.response.start", "status": 499,
                                    "headers": [(b"content-type", b"application/json")]})
                await send_with_id({"type": "http.response.body", "body": json.dumps({"detail": "request cancelled", "id": rid}).encode()})
        except Exception:
            log.exception(
                "%s %s %s %s",
                paint("✗ 500", "red", True),
                method,
                path,
                paint(fmt_seconds(time.perf_counter() - started), "yellow"),
            )
            raise
        else:
            color = "green" if status < 400 else "yellow" if status < 500 else "red"
            log.info(
                "%s %s %s %s",
                paint(f"← {status}", color, True),
                method,
                path,
                paint(fmt_seconds(time.perf_counter() - started), "yellow"),
            )
        finally:
            if _active.get(rid) is task:
                _active.pop(rid, None)
            _cancelled.discard(rid)
            request_id.reset(token)
