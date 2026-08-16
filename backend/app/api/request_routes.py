"""RMA Request Portal routes. Standalone queue, independent of the FY2526/2526
DN pipeline -- see backend/app/models/request_schemas.py for the field config
and C:\\Users\\Matto\\.claude\\plans\\foamy-sniffing-lobster.md for the design.
"""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.api.deps import require_perm
from app.models.request_schemas import (
    REQUEST_STATUSES,
    RequestStatusUpdate,
    RmaRequestRecord,
    RmaRequestSubmit,
    validate_request_fields,
)
from app.services.audit_logger import AuditLogger
from app.services.request_notify_service import send_new_request_notification
from app.services.requests_db import get_requests_db

router = APIRouter(prefix="/api/requests")

audit_logger = AuditLogger()


@router.post("", response_model=RmaRequestRecord)
def submit_request(
    payload: RmaRequestSubmit,
    background_tasks: BackgroundTasks,
    user: Annotated[dict, Depends(require_perm("submit_request"))],
):
    errors = validate_request_fields(payload.fields)
    if errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    record = get_requests_db().create_request(
        requester_user_id=user["id"],
        requester_username=user["username"],
        requester_display_name=user["display_name"],
        fields=payload.fields,
    )

    audit_logger.log(
        filename=record["request_code"],
        dn_number=record["dn_number"] or "-",
        action="RMA Request Submitted",
        status="New",
        user=user["display_name"],
    )

    background_tasks.add_task(send_new_request_notification, record)
    return RmaRequestRecord(**record)


@router.get("/mine", response_model=list[RmaRequestRecord])
def list_my_requests(
    user: Annotated[dict, Depends(require_perm("submit_request"))],
):
    records = get_requests_db().list_by_user(user["id"])
    return [RmaRequestRecord(**r) for r in records]


@router.get("", response_model=list[RmaRequestRecord])
def list_request_queue(
    status: str | None = None,
    _: Annotated[dict, Depends(require_perm("manage_requests"))] = None,
):
    records = get_requests_db().list_all(status)
    return [RmaRequestRecord(**r) for r in records]


@router.patch("/{request_id}/status", response_model=RmaRequestRecord)
def update_request_status(
    request_id: int,
    payload: RequestStatusUpdate,
    user: Annotated[dict, Depends(require_perm("manage_requests"))],
):
    if payload.status not in REQUEST_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {payload.status}")

    updated = get_requests_db().update_status(request_id, payload.status, payload.internal_notes)
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    audit_logger.log(
        filename=updated["request_code"],
        dn_number=updated["dn_number"] or "-",
        action="RMA Request Status Update",
        status=payload.status,
        user=user["display_name"],
    )
    return RmaRequestRecord(**updated)
