"""RMA Request Portal schemas.

REQUEST_FIELDS is the single source of truth for the requester-submitted
field list. It's provisional (a reference Excel with the final list is
pending) -- extend/rename/remove entries here and in the frontend mirror
(frontend/src/lib/requestFormFields.ts) and nothing else needs to change,
since submitted answers are stored as a loosely-typed dict rather than one
named model attribute per field.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

REQUEST_STATUSES = ["New", "Pending", "Approved"]


class RequestFieldDef(BaseModel):
    key: str
    label: str
    type: Literal["text", "textarea", "number", "date"]
    required: bool = True


REQUEST_FIELDS: list[RequestFieldDef] = [
    RequestFieldDef(key="customer_name", label="Name of Customer", type="text"),
    RequestFieldDef(key="dn_number", label="DN Number / Reference (if known)", type="text", required=False),
    RequestFieldDef(key="problem_description", label="Problem Description", type="textarea"),
    RequestFieldDef(key="lot_qty", label="How many lots / qty", type="text"),
    RequestFieldDef(key="test_flow", label="Test Flow", type="text"),
    RequestFieldDef(key="date_of_return", label="Date of Return", type="date"),
    RequestFieldDef(key="expected_finish_date", label="Expected Finish Date", type="date"),
]


def validate_request_fields(fields: dict[str, str]) -> list[str]:
    """Required-field check driven entirely by REQUEST_FIELDS."""
    errors = []
    for f in REQUEST_FIELDS:
        if f.required and not (fields.get(f.key) or "").strip():
            errors.append(f"{f.label} is required")
    return errors


class RmaRequestSubmit(BaseModel):
    fields: dict[str, str]


class RequestStatusUpdate(BaseModel):
    status: str
    internal_notes: str | None = None


class RmaRequestRecord(BaseModel):
    id: int
    request_code: str
    status: str
    requester_username: str
    requester_display_name: str
    customer_name: str
    dn_number: str
    linked_dn_number: str | None = None
    linked_case_id: int | None = None
    fields: dict[str, str]
    internal_notes: str = ""
    created_at: str
    updated_at: str
