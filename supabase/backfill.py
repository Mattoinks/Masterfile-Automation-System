"""One-off backfill: current .xlsx masterfile + auth.db/requests.db -> Supabase Postgres.

NOT part of the running app - run manually, once, from a terminal, after
applying supabase/migrations/0001_initial_schema.sql. See supabase/README.md
for the full procedure (create a copy of the source files first, backfill
into a scratch schema/project, and verify row counts before pointing this at
anything real).

Usage:
    python supabase/backfill.py \
        --xlsx path/to/RMA_MASTER.xlsx \
        --auth-db path/to/auth.db \
        --requests-db path/to/requests.db \
        --db-url "postgresql://postgres:<password>@<direct-host>:5432/postgres"

--db-url can also come from the SUPABASE_DB_URL_ADMIN env var. It must be a
*direct* (non-pooled) connection as a role that can bypass RLS (the
`postgres` superuser Supabase gives you by default is fine) - this script
loads data before the app-facing app_role/app_bypass_role are ever used for
request traffic, so RLS is irrelevant here.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

import psycopg
from openpyxl import load_workbook

# Keep in sync with backend/config/field_mapping.json's pdf_to_excel_headers.
# Maps a normalized header string -> the Postgres column name.
FIELD_HEADER_ALIASES: dict[str, list[str]] = {
    "case_id": ["Case_ID", "No"],
    "dn_date": ["DN Creation Date", "Date Create Q lot no.", "Date Q lot no. Create"],
    "data_source": ["Data source"],
    "rma_number": ["QMR/SAP no./Jira", "QMR/SAP no."],
    "store_received": ["STORE Received", "STORE Receive"],
    "recd_lw": ["Recd LW"],
    "recd_mth": ["Recd Mth"],
    "dn_number": ["DN / Invoice No.", "DN/Invoice No.", "DN / Invoice No"],
    "type_of_return": ["Type of Return"],
    "device": ["Device"],
    "package": ["Package"],
    "gf": ["GF"],
    "date_code": ["Date code"],
    "dc_bau": ["DC Bau"],
    "test_bau": ["Test Bau"],
    "vkl_bau": ["VKL Bau"],
    "quantity": ["Qty   (pcs)", "Qty (pcs)", "Return Qty"],
    "dc": ["DC"],
    "owner": ["Owner"],
    "rework_flow_procedure": ["Rework Flow Procedure"],
    "cause_owner": ["Cause Owner", "Rework Flow By", "Engineer"],
    "case_title": ["Case Title"],
    "store_lot_qty": ["Store \n(Lot no / Qty)", "Store (Lot no / Qty)"],
    "status": ["Status"],
}
FY_SHEET_NAMES = ["FY2526", "FY2627", "FY2728"]
LOT2526_SHEET_NAME = "2526"


def _normalize_header(value: Any) -> str:
    return " ".join(str(value or "").split())


def _build_header_column_map(header_row) -> dict[str, int]:
    """header text (normalized) -> 1-based column index, for one sheet's header row."""
    by_text = {_normalize_header(c.value): c.column for c in header_row if c.value is not None}
    field_to_col: dict[str, int] = {}
    for field, aliases in FIELD_HEADER_ALIASES.items():
        for alias in aliases:
            col = by_text.get(_normalize_header(alias))
            if col is not None:
                field_to_col[field] = col
                break
    return field_to_col


def _cell_text(ws, row: int, col: int | None) -> str | None:
    if col is None:
        return None
    value = ws.cell(row=row, column=col).value
    if value is None or value == "":
        return None
    return str(value)


def _cell_number(ws, row: int, col: int | None) -> float | None:
    if col is None:
        return None
    value = ws.cell(row=row, column=col).value
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _cell_date(ws, row: int, col: int) -> datetime.date | None:
    value = ws.cell(row=row, column=col).value
    if value is None or value == "":
        return None
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    try:
        return datetime.datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None


def read_masterfile_records(xlsx_path: Path) -> list[dict[str, Any]]:
    wb = load_workbook(xlsx_path, data_only=True)
    records: list[dict[str, Any]] = []
    for sheet_name in FY_SHEET_NAMES:
        if sheet_name not in wb.sheetnames:
            continue
        ws = wb[sheet_name]
        field_cols = _build_header_column_map(ws[1])
        case_id_col = field_cols.get("case_id")
        if case_id_col is None:
            print(f"  [{sheet_name}] no Case_ID/No column found in header row, skipping sheet")
            continue
        for row in range(2, ws.max_row + 1):
            case_id = _cell_text(ws, row, case_id_col)
            if case_id is None:
                continue  # blank/separator row
            record = {
                "fy": sheet_name,
                "case_id": case_id,
                "row_number": row,
                "quantity": _cell_number(ws, row, field_cols.get("quantity")),
                "status": _cell_text(ws, row, field_cols.get("status")) or "Open",
            }
            for field in FIELD_HEADER_ALIASES:
                if field in ("case_id", "quantity", "status"):
                    continue
                record[field] = _cell_text(ws, row, field_cols.get(field))
            records.append(record)
        print(f"  [{sheet_name}] {sum(1 for r in records if r['fy'] == sheet_name)} rows")
    return records


# Columns B-H on the '2526' sheet (Lot2526ExcelWriter._COLUMNS), 1-based column index.
_LOT2526_LINE_COLS = {
    "original_label_lot_no": 3,
    "date_code": 4,
    "return_qty_from_dc": 5,
    "disposition_or_ss_plan_name": 6,
    "date_attached_ss_plan": 7,
    "lw": 8,
}
# Columns I-M (Lot2526ExcelWriter._LOT_CREATION_FIELDS).
_LOT2526_CREATION_COLS = {
    "date_created": 9,
    "created_lot_no": 10,
    "created_date_code": 11,
    "physical_lot_qty": 12,
    "lot_code": 13,
}


def _is_lot2526_subtotal_row(ws, row: int) -> bool:
    """Mirrors Lot2526ExcelWriter._is_subtotal_row: A/B/C blank, E populated."""
    col_a = ws.cell(row=row, column=1).value
    col_b = ws.cell(row=row, column=2).value
    col_c = ws.cell(row=row, column=3).value
    col_e = ws.cell(row=row, column=5).value
    return col_a is None and col_b is None and col_c is None and col_e is not None


def _is_lot2526_blank_row(ws, row: int) -> bool:
    return all(ws.cell(row=row, column=c).value is None for c in range(1, 14))


def read_lot2526(xlsx_path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Returns (cases, lines). Each line carries a 0-based case_index into
    `cases` (resolved to a real case_id by the caller after cases are
    inserted and their generated ids are known)."""
    wb = load_workbook(xlsx_path, data_only=True)
    if LOT2526_SHEET_NAME not in wb.sheetnames:
        return [], []
    ws = wb[LOT2526_SHEET_NAME]

    cases: list[dict[str, Any]] = []
    lines: list[dict[str, Any]] = []
    current_case_index: int | None = None
    line_order = 0

    for row in range(2, ws.max_row + 1):
        col_a = ws.cell(row=row, column=1).value
        if isinstance(col_a, (int, float)):
            case_no = int(col_a)
            test_bau = _cell_text(ws, row, 2)
            cases.append({"case_no": case_no, "test_bau": test_bau})
            current_case_index = len(cases) - 1
            line_order = 0
            lines.append(_read_lot2526_line(ws, row, current_case_index, line_order))
            line_order += 1
        elif _is_lot2526_subtotal_row(ws, row):
            continue  # derived; recomputed via SUM() in Postgres
        elif _is_lot2526_blank_row(ws, row):
            continue  # separator row between cases
        else:
            if current_case_index is None:
                continue  # malformed/unexpected leading row; skip defensively
            lines.append(_read_lot2526_line(ws, row, current_case_index, line_order))
            line_order += 1

    print(f"  [2526] {len(cases)} cases, {len(lines)} lot lines")
    return cases, lines


def _read_lot2526_line(ws, row: int, case_index: int, line_order: int) -> dict[str, Any]:
    return {
        "case_index": case_index,
        "line_order": line_order,
        "original_label_lot_no": _cell_text(ws, row, _LOT2526_LINE_COLS["original_label_lot_no"]),
        "date_code": _cell_text(ws, row, _LOT2526_LINE_COLS["date_code"]),
        "return_qty_from_dc": _cell_number(ws, row, _LOT2526_LINE_COLS["return_qty_from_dc"]),
        "disposition_or_ss_plan_name": _cell_text(ws, row, _LOT2526_LINE_COLS["disposition_or_ss_plan_name"]),
        "date_attached_ss_plan": _cell_date(ws, row, _LOT2526_LINE_COLS["date_attached_ss_plan"]),
        "lw": _cell_text(ws, row, _LOT2526_LINE_COLS["lw"]),
        "date_created": _cell_date(ws, row, _LOT2526_CREATION_COLS["date_created"]),
        "created_lot_no": _cell_text(ws, row, _LOT2526_CREATION_COLS["created_lot_no"]),
        "created_date_code": _cell_text(ws, row, _LOT2526_CREATION_COLS["created_date_code"]),
        "physical_lot_qty": _cell_number(ws, row, _LOT2526_CREATION_COLS["physical_lot_qty"]),
        "lot_code": _cell_text(ws, row, _LOT2526_CREATION_COLS["lot_code"]),
    }


def backfill_masterfile(conn: psycopg.Connection, xlsx_path: Path) -> None:
    print("Reading FY* masterfile sheets...")
    records = read_masterfile_records(xlsx_path)
    columns = [
        "fy", "case_id", "dn_date", "data_source", "rma_number", "store_received",
        "recd_lw", "recd_mth", "dn_number", "type_of_return", "device", "package",
        "gf", "date_code", "dc_bau", "test_bau", "vkl_bau", "quantity", "dc", "owner",
        "rework_flow_procedure", "cause_owner", "case_title", "store_lot_qty",
        "status", "row_number",
    ]
    sql = f"insert into rma_masterfile_records ({', '.join(columns)}) values ({', '.join(['%s'] * len(columns))})"
    with conn.cursor() as cur:
        cur.executemany(sql, [tuple(r.get(c) for c in columns) for r in records])
    print(f"Inserted {len(records)} rma_masterfile_records rows.")


def backfill_lot2526(conn: psycopg.Connection, xlsx_path: Path) -> None:
    print("Reading '2526' worksheet...")
    cases, lines = read_lot2526(xlsx_path)
    case_ids: list[int] = []
    with conn.cursor() as cur:
        for case in cases:
            cur.execute(
                "insert into lot2526_cases (case_no, test_bau) values (%s, %s) returning id",
                (case["case_no"], case["test_bau"]),
            )
            case_ids.append(cur.fetchone()[0])

        line_columns = [
            "case_id", "line_order", "original_label_lot_no", "date_code",
            "return_qty_from_dc", "disposition_or_ss_plan_name", "date_attached_ss_plan",
            "lw", "date_created", "created_lot_no", "created_date_code",
            "physical_lot_qty", "lot_code",
        ]
        sql = f"insert into lot2526_lot_lines ({', '.join(line_columns)}) values ({', '.join(['%s'] * len(line_columns))})"
        rows = []
        for line in lines:
            row = dict(line)
            row["case_id"] = case_ids[row.pop("case_index")]
            rows.append(tuple(row.get(c) for c in line_columns))
        cur.executemany(sql, rows)
    print(f"Inserted {len(cases)} lot2526_cases, {len(lines)} lot2526_lot_lines rows.")


def backfill_auth(conn: psycopg.Connection, auth_db_path: Path) -> None:
    print("Reading auth.db...")
    src = sqlite3.connect(auth_db_path)
    src.row_factory = sqlite3.Row
    users = src.execute("SELECT * FROM users").fetchall()
    sessions = src.execute("SELECT * FROM sessions").fetchall()
    src.close()

    with conn.cursor() as cur:
        for u in users:
            cur.execute(
                """insert into users (id, username, password_hash, display_name, role, active, created_at, last_login)
                   overriding system value
                   values (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (u["id"], u["username"], u["password_hash"], u["display_name"], u["role"],
                 bool(u["active"]), u["created_at"], u["last_login"]),
            )
        cur.execute("select setval(pg_get_serial_sequence('users', 'id'), coalesce(max(id), 1)) from users")
        for s in sessions:
            cur.execute(
                """insert into sessions (token, user_id, expires_at, remember_me, created_at)
                   values (%s, %s, %s, %s, %s)""",
                (s["token"], s["user_id"], s["expires_at"], bool(s["remember_me"]), s["created_at"]),
            )
    print(f"Inserted {len(users)} users, {len(sessions)} sessions.")


def backfill_requests(conn: psycopg.Connection, requests_db_path: Path) -> None:
    print("Reading requests.db...")
    src = sqlite3.connect(requests_db_path)
    src.row_factory = sqlite3.Row
    rows = src.execute("SELECT * FROM rma_requests").fetchall()
    src.close()

    with conn.cursor() as cur:
        for r in rows:
            cur.execute(
                """insert into rma_requests
                   (id, status, requester_user_id, requester_username, requester_display_name,
                    customer_name, dn_number, linked_dn_number, linked_case_id, fields_json,
                    internal_notes, created_at, updated_at)
                   overriding system value
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (r["id"], r["status"], r["requester_user_id"], r["requester_username"],
                 r["requester_display_name"], r["customer_name"], r["dn_number"],
                 r["linked_dn_number"], r["linked_case_id"], json.dumps(json.loads(r["fields_json"])),
                 r["internal_notes"], r["created_at"], r["updated_at"]),
            )
        cur.execute(
            "select setval(pg_get_serial_sequence('rma_requests', 'id'), coalesce(max(id), 1)) from rma_requests"
        )
    print(f"Inserted {len(rows)} rma_requests rows.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", type=Path, required=True, help="Path to the masterfile .xlsx")
    parser.add_argument("--auth-db", type=Path, help="Path to auth.db (skipped if omitted)")
    parser.add_argument("--requests-db", type=Path, help="Path to requests.db (skipped if omitted)")
    parser.add_argument(
        "--db-url", default=os.environ.get("SUPABASE_DB_URL_ADMIN", ""),
        help="Direct (non-pooled) Postgres connection string with RLS-bypass privileges",
    )
    args = parser.parse_args()

    if not args.db_url:
        print("error: --db-url or SUPABASE_DB_URL_ADMIN is required", file=sys.stderr)
        sys.exit(1)
    if not args.xlsx.exists():
        print(f"error: {args.xlsx} not found", file=sys.stderr)
        sys.exit(1)

    with psycopg.connect(args.db_url) as conn:
        with conn.transaction():
            backfill_masterfile(conn, args.xlsx)
            backfill_lot2526(conn, args.xlsx)
            if args.auth_db:
                if not args.auth_db.exists():
                    print(f"error: {args.auth_db} not found", file=sys.stderr)
                    sys.exit(1)
                backfill_auth(conn, args.auth_db)
            if args.requests_db:
                if not args.requests_db.exists():
                    print(f"error: {args.requests_db} not found", file=sys.stderr)
                    sys.exit(1)
                backfill_requests(conn, args.requests_db)
        print("Done. Transaction committed.")


if __name__ == "__main__":
    main()
