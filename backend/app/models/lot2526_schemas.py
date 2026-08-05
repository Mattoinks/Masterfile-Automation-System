"""Pydantic models for the 2526 masterfile module (Phase 1: DN breakdown only).

Independent from app/models/schemas.py (the FY2526 record shape) — the 2526
worksheet has a different column set and is not derived from it.
"""

from pydantic import BaseModel


class Lot2526BreakdownRecord(BaseModel):
    """One draft/saved row covering columns A-H of the '2526' worksheet,
    plus Created Lot# (column J), Date Created (column I), and the Created
    Lot#'s Date Code (column K) - all deterministic at intake time (from
    Original Label Lot No. and today's date), computed once, editable in
    review, source of truth once saved. Physical Lot Qty (column L) and Lot
    Code (column M) have no extracted source - always blank by default,
    but left editable here too in case they're already known at intake
    time (usually they're filled in later via the 2526 Cases view, once
    the physical split has actually happened)."""

    case_no: int | None = None
    record_id: str | None = None
    test_bau: str = ""
    original_label_lot_no: str = ""
    date_code: str = ""
    return_qty_from_dc: str = ""
    created_lot_no: str = ""
    disposition_or_ss_plan_name: str = ""
    date_attached_ss_plan: str = ""
    lw: str = ""
    date_created: str = ""
    created_date_code: str = ""
    physical_lot_qty: str = ""
    lot_code: str = ""
    filename: str = ""


class Lot2526ProcessResponse(BaseModel):
    drafts: list[Lot2526BreakdownRecord] = []
    errors: list[str] = []


class Lot2526SaveRequest(BaseModel):
    records: list[Lot2526BreakdownRecord]


class Lot2526SaveResponse(BaseModel):
    saved_case_numbers: list[int] = []
    errors: list[str] = []


class Lot2526CaseSummary(BaseModel):
    """One row in the 2526 Cases list."""

    case_no: int
    test_bau: str = ""
    lot_line_count: int = 0
    lot_creation_count: int = 0
    total_return_qty: float = 0


class Lot2526LotCreationEntry(BaseModel):
    """The 5 editable columns J-M-adjacent fields for one row: Created
    Lot# plus the fields that can only be known once the physical split
    actually happens. Shared request-body shape for both the secondary
    insert-a-new-row action and the primary update-an-existing-row action."""

    created_lot_no: str = ""
    date_created: str = ""
    created_date_code: str = ""
    physical_lot_qty: str = ""
    lot_code: str = ""


class Lot2526CaseRow(BaseModel):
    """One physical row within a case's block - its original A-H
    breakdown data (if any) and its I-M lot-creation fields (if any),
    since a row can now carry both. row_index is this row's 0-based
    position among the case's non-subtotal rows, re-derived fresh on every
    request - never cache it across requests, since inserting a row
    anywhere in the sheet shifts positions."""

    row_index: int
    original_label_lot_no: str = ""
    date_code: str = ""
    return_qty_from_dc: str = ""
    created_lot_no: str = ""
    suggested_created_lot_no: str = ""  # fallback, only set when created_lot_no is empty (legacy rows)
    date_created: str = ""
    created_date_code: str = ""
    physical_lot_qty: str = ""
    lot_code: str = ""


class Lot2526CaseDetail(BaseModel):
    case_no: int
    test_bau: str = ""
    rows: list[Lot2526CaseRow] = []
