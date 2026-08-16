"""Best-effort email notification when a new RMA request is submitted.

Never raises -- a submission must succeed even if SMTP is unconfigured,
misconfigured, or unreachable. Intended to be called via FastAPI
BackgroundTasks after the DB insert has already committed.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

from app.models.request_schemas import REQUEST_FIELDS
from config.settings import (
    PORTAL_BASE_URL,
    REQUEST_NOTIFY_RECIPIENTS,
    SMTP_FROM_ADDRESS,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USERNAME,
)

logger = logging.getLogger(__name__)


def _build_message(request: dict[str, Any]) -> EmailMessage:
    fields = request["fields"]
    dn_number = request.get("dn_number") or "Not yet available"

    lines = [
        f"Request ID: {request['request_code']}",
        f"Requester: {request['requester_display_name']}",
        f"DN Number: {dn_number}",
    ]
    for f in REQUEST_FIELDS:
        if f.key == "dn_number":
            continue  # already shown above
        lines.append(f"{f.label}: {fields.get(f.key, '')}")

    if PORTAL_BASE_URL:
        lines.append("")
        lines.append(f"View request: {PORTAL_BASE_URL}/requests?id={request['id']}")

    msg = EmailMessage()
    msg["Subject"] = f"New RMA Request {request['request_code']} — {request.get('customer_name', '')}"
    msg["From"] = SMTP_FROM_ADDRESS or SMTP_USERNAME
    msg["To"] = ", ".join(REQUEST_NOTIFY_RECIPIENTS)
    msg.set_content("A new RMA request was submitted.\n\n" + "\n".join(lines))
    return msg


def send_new_request_notification(request: dict[str, Any]) -> None:
    if not SMTP_HOST or not SMTP_USERNAME or not REQUEST_NOTIFY_RECIPIENTS:
        logger.warning("SMTP not configured; skipping RMA request notification email")
        return

    msg = _build_message(request)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
    except Exception:
        logger.exception("Failed to send RMA request notification email")
