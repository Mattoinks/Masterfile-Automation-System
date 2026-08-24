"""Phase 2 read layer: masterfile reads backed by Postgres instead of the
SQLite index / openpyxl. Output shape matches index_db.IndexDB's methods
exactly (same flat columns + a `fields` sub-dict with every field) so
record_service.py's/processing_service.py's callers need no changes.

The SQLite index (index_db.py) keeps being written to exactly as before -
this file only replaces reads, per the migration plan's Phase 2 scope.
Every function here either returns real data from Postgres or raises -
callers are responsible for catching and falling back to the pre-Phase-2
path (index_db/Excel), which stays live and current throughout Phase 2 for
exactly that reason.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from app.services import db

_MASTERFILE_FIELDS = [
    "case_id", "fy", "dn_date", "data_source", "rma_number", "store_received",
    "recd_lw", "recd_mth", "dn_number", "type_of_return", "device", "package",
    "gf", "date_code", "dc_bau", "test_bau", "vkl_bau", "quantity", "dc", "owner",
    "rework_flow_procedure", "cause_owner", "case_title", "store_lot_qty",
    "status", "row_number",
]

# Extracts the leading digit run of case_id ("1866-R1" -> "1866"), mirroring
# the leniency SQLite's CAST(case_id AS INTEGER) had (Postgres has no
# equivalent lenient cast). Falls back to plain text ordering for case_ids
# with no leading digits at all.
_ORDER_BY_CASE_ID_DESC = (
    "order by nullif(regexp_replace(case_id, '\\D.*$', ''), '')::bigint desc nulls last, "
    "case_id desc"
)


def _clean(value: Any) -> Any:
    if isinstance(value, Decimal):
        as_float = float(value)
        return int(as_float) if as_float == int(as_float) else as_float
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _row_to_index_shape(row: dict[str, Any]) -> dict[str, Any]:
    fields = {k: _clean(row.get(k)) for k in _MASTERFILE_FIELDS if row.get(k) is not None}
    return {
        "case_id": str(row.get("case_id") or ""),
        "dn_number": str(row.get("dn_number") or ""),
        "rma_number": str(row.get("rma_number") or ""),
        "device": str(row.get("device") or ""),
        "package": str(row.get("package") or ""),
        "owner": str(row.get("owner") or ""),
        "quantity": str(row.get("quantity") if row.get("quantity") is not None else ""),
        "status": row.get("status") or "Open",
        "row_number": int(row.get("row_number") or 0),
        "worksheet": row.get("fy") or "",
        "payload": json.dumps(fields, default=str),
        "updated_at": _clean(row.get("updated_at")),
        "fields": fields,
    }


def search(
    query: str = "",
    case_id: str = "",
    dn_number: str = "",
    device: str = "",
    owner: str = "",
    package: str = "",
    sap_number: str = "",
    include_deleted: bool = False,
    limit: int = 100,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    if not include_deleted:
        clauses.append("lower(coalesce(status, '')) not in ('deleted', 'archived')")

    if query:
        clauses.append(
            "(case_id ilike %s or dn_number ilike %s or device ilike %s "
            "or owner ilike %s or package ilike %s or rma_number ilike %s)"
        )
        q = f"%{query}%"
        params.extend([q, q, q, q, q, q])

    for field, val in [
        ("case_id", case_id), ("dn_number", dn_number), ("device", device),
        ("owner", owner), ("package", package), ("rma_number", sap_number),
    ]:
        if val:
            clauses.append(f"{field} ilike %s")
            params.append(f"%{val}%")

    where = " and ".join(clauses) if clauses else "true"
    sql = f"select * from rma_masterfile_records where {where} {_ORDER_BY_CASE_ID_DESC} limit %s"
    params.append(limit)

    with db.bypass_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_index_shape(r) for r in rows]


def get_recycle_bin(limit: int = 200) -> list[dict[str, Any]]:
    with db.bypass_connection() as conn:
        rows = conn.execute(
            "select * from rma_masterfile_records where status = %s order by updated_at desc limit %s",
            ("Deleted", limit),
        ).fetchall()
    return [_row_to_index_shape(r) for r in rows]


def get_by_case_id(case_id: str) -> dict[str, Any] | None:
    with db.bypass_connection() as conn:
        row = conn.execute(
            "select * from rma_masterfile_records where case_id = %s", (case_id,)
        ).fetchone()
    return _row_to_index_shape(row) if row else None


def get_all_active_records(limit: int = 10000) -> list[dict[str, Any]]:
    return search(include_deleted=False, limit=limit)
