"""Normalize masterfile row status values for Excel storage and SQLite indexing."""

from __future__ import annotations

from enum import Enum
from typing import Any

from app.models.schemas import RecordStatus

INACTIVE_STATUSES = frozenset({"deleted", "archived"})

_ENUM_NAME_TO_VALUE = {member.name: member.value for member in RecordStatus}


def normalize_record_status(status: Any) -> str:
    """Convert enum objects, legacy strings, and blanks to a plain status label."""
    if status is None or status == "":
        return "Open"
    if isinstance(status, Enum):
        return str(status.value)
    if hasattr(status, "value") and not isinstance(status, (str, int, float)):
        return str(status.value)

    text = str(status).strip()
    if not text:
        return "Open"

    if text.startswith("RecordStatus."):
        member = text.split(".", 1)[1]
        return _ENUM_NAME_TO_VALUE.get(member, member.replace("_", " ").title())

    lowered = text.lower()
    for member in RecordStatus:
        if member.value.lower() == lowered or member.name.lower() == lowered:
            return member.value

    return text


def is_active_status(status: Any) -> bool:
    return normalize_record_status(status).lower() not in INACTIVE_STATUSES
