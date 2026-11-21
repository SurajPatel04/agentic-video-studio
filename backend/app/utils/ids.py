"""Ids for jobs and requests: new ones are UUID4 strings ("3f2b6c1e-8d4a-4f0b-9c2e-5a7d1e9b0c44").

Older jobs used short hex ids (12 hex = short video / render, 10 hex = long video); they still load.
"""

import re
import uuid

UUID4 = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
UUID4_RE = re.compile(rf"^{UUID4}$")
JOB_ID_RE = re.compile(rf"^(?:{UUID4}|[a-f0-9]{{10}}|[a-f0-9]{{12}})$")  # new ids + the older short ones
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")  # X-Request-ID sent by a client


def new_id() -> str:
    return str(uuid.uuid4())


def is_job_id(value: str) -> bool:
    return bool(JOB_ID_RE.fullmatch(value))
