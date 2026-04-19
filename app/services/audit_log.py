from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("opsapp.audit")


def log_event(db: Any, user: str, action: str, detail: str, *, request_id: str | None = None) -> None:
    """Lightweight audit logging hook using structured application logs."""
    log.info(
        "audit_event",
        extra={
            "username": user,
            "action": action,
            "detail": detail,
            "request_id": request_id,
        },
    )
