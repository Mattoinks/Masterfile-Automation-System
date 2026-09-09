"""Writes DN-breakdown data for the '2526' lot-breakdown workflow.

Phase 3: Postgres (lot2526_cases/lot2526_lot_lines) is the sole store -
same class name and public method signatures as before this became
Postgres-backed (lot2526_routes.py needs no changes), but case-no
generation and row lookups now query Postgres directly. Excel is generated
fresh from these same tables on demand (ExcelService.generate_export_workbook()
-> write_full_export() below), never read or written live.
"""

from datetime import date, datetime
from typing import Any

from openpyxl.styles import Alignment, Font

from app.services import db

WORKSHEET_NAME = "2526"
DATE_NUMBER_FORMAT = r"[$-4809]d\ mmm\ yyyy;@"
# The sheet's template only pre-formats a handful of rows with centered
# alignment; rows written beyond that range fall back to Excel's default
# (left/bottom) unless we set this explicitly on every cell we write.
_CELL_ALIGNMENT = Alignment(horizontal="center", vertical="center")

# Column A-H, in order.
_COLUMNS = [
    "test_bau",
    "original_label_lot_no",
    "date_code",
    "return_qty_from_dc",
    "disposition_or_ss_plan_name",
    "date_attached_ss_plan",
    "lw",
]

# Columns I-M.
_LOT_CREATION_COLUMN_OFFSET = 9  # column I
_LOT_CREATION_FIELDS = [
    "date_created",
    "created_lot_no",
    "created_date_code",
    "physical_lot_qty",
    "lot_code",
]

_DATE_FIELDS = {"date_attached_ss_plan", "date_created"}
_NUMERIC_FIELDS = {"return_qty_from_dc", "physical_lot_qty"}


class Lot2526ExcelError(Exception):
    pass


class Lot2526ExcelLockedError(Lot2526ExcelError):
    pass


def _coerce_date(value: Any):
    if value in (None, ""):
        return None
    if isinstance(value, (datetime, date)):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return value  # let Postgres's own input parser try, or fail loudly


def _coerce_number(value: Any):
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


class Lot2526ExcelWriter:
    def __init__(self, worksheet_name: str = WORKSHEET_NAME) -> None:
        self.worksheet_name = worksheet_name

    @staticmethod
    def _prepare_fields(fields: dict[str, Any], keys: list[str]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key in keys:
            value = fields.get(key)
            if value in (None, ""):
                continue
            if key in _DATE_FIELDS:
                value = _coerce_date(value)
            elif key in _NUMERIC_FIELDS:
                value = _coerce_number(value)
            result[key] = value
        return result

    @staticmethod
    def _log_pg_write_failure(action: str, exc: Exception) -> None:
        from app.services.audit_logger import AuditLogger
        AuditLogger().log(
            filename="postgres-write", dn_number="2526", action=f"Postgres Write ({action})",
            status="FAILED", user="System", details=str(exc)[:500],
        )

    @staticmethod
    def _format_cell_date(value: Any) -> str:
        if value is None:
            return ""
        if hasattr(value, "strftime"):
            return value.strftime("%Y-%m-%d")
        return str(value)

    @staticmethod
    def _group_by_filename(fields_list: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
        """Consecutive entries sharing the same filename (or record_id, for
        callers that don't set filename) belong to one case. An entry with
        neither becomes its own single-row group - safe fallback, never
        merges unrelated rows."""
        groups: list[list[dict[str, Any]]] = []
        current_key: Any = object()
        current_group: list[dict[str, Any]] = []
        for fields in fields_list:
            key = fields.get("filename") or fields.get("record_id") or object()
            if current_group and key != current_key:
                groups.append(current_group)
                current_group = []
            current_group.append(fields)
            current_key = key
        if current_group:
            groups.append(current_group)
        return groups

    def get_next_case_no(self) -> int:
        with db.bypass_connection() as conn:
            row = conn.execute("select max(case_no) as m from lot2526_cases").fetchone()
        return (row["m"] or 0) + 1

    def append_breakdown_rows(self, fields_list: list[dict[str, Any]]) -> list[int]:
        """Appends one case per group of consecutive same-filename entries
        in fields_list. Within a case: the first entry's test_bau becomes
        the case's test_bau; every entry becomes one lot_line, in order.
        Returns the case numbers written, one per case/group."""
        if not fields_list:
            return []
        try:
            case_numbers: list[int] = []
            with db.bypass_connection() as conn:
                next_case_no = (conn.execute("select max(case_no) as m from lot2526_cases").fetchone()["m"] or 0) + 1
                for group in self._group_by_filename(fields_list):
                    case_row = conn.execute(
                        "insert into lot2526_cases (case_no, test_bau, dn_number) values (%s, %s, %s) returning id",
                        (next_case_no, group[0].get("test_bau"), group[0].get("dn_number")),
                    ).fetchone()
                    case_id = case_row["id"]
                    for line_order, fields in enumerate(group):
                        line_fields = self._prepare_fields(fields, _COLUMNS[1:])
                        columns = ["case_id", "line_order"] + list(line_fields.keys())
                        values = [case_id, line_order] + list(line_fields.values())
                        placeholders = ", ".join(["%s"] * len(columns))
                        conn.execute(
                            f"insert into lot2526_lot_lines ({', '.join(columns)}) values ({placeholders})",
                            values,
                        )
                    case_numbers.append(next_case_no)
                    next_case_no += 1
            return case_numbers
        except Exception as exc:
            self._log_pg_write_failure("append_breakdown_rows", exc)
            raise Lot2526ExcelError(f"Failed to save 2526 records: {exc}") from exc

    def append_breakdown_row(self, fields: dict[str, Any]) -> int:
        """Appends one single-lot-line case. Returns the case number written."""
        return self.append_breakdown_rows([fields])[0]

    def list_cases(self) -> list[dict[str, Any]]:
        """Summary per case: case_no, test_bau, how many original lot
        lines it has, how many have their physical lot-creation recorded
        (physical_lot_qty filled - the strongest signal an engineer has
        actually visited that row after the split happened), and the
        total Return Qty from DC."""
        with db.bypass_connection() as conn:
            cases = conn.execute("select * from lot2526_cases order by case_no").fetchall()
            lines = conn.execute(
                "select * from lot2526_lot_lines order by case_id, line_order"
            ).fetchall()

        lines_by_case: dict[int, list[dict[str, Any]]] = {}
        for line in lines:
            lines_by_case.setdefault(line["case_id"], []).append(line)

        result: list[dict[str, Any]] = []
        for case in cases:
            case_lines = lines_by_case.get(case["id"], [])
            lot_line_count = sum(1 for l in case_lines if l.get("original_label_lot_no"))
            lot_creation_count = sum(1 for l in case_lines if l.get("physical_lot_qty") is not None)
            total_qty = sum(
                float(l["return_qty_from_dc"]) for l in case_lines if l.get("return_qty_from_dc") is not None
            )
            lot_numbers = [str(l["original_label_lot_no"]) for l in case_lines if l.get("original_label_lot_no")]
            result.append({
                "case_no": case["case_no"],
                "test_bau": str(case.get("test_bau") or ""),
                "dn_number": str(case.get("dn_number") or ""),
                "lot_numbers": lot_numbers,
                "lot_line_count": lot_line_count,
                "lot_creation_count": lot_creation_count,
                "total_return_qty": int(total_qty) if total_qty == int(total_qty) else total_qty,
            })
        return result

    def get_case_detail(self, case_no: int) -> dict[str, Any] | None:
        """One row per lot line, its A-H breakdown data and its I-M
        lot-creation fields. row_index is each line's 0-based line_order.
        None if case_no doesn't exist."""
        with db.bypass_connection() as conn:
            case = conn.execute(
                "select * from lot2526_cases where case_no = %s", (case_no,)
            ).fetchone()
            if case is None:
                return None
            lines = conn.execute(
                "select * from lot2526_lot_lines where case_id = %s order by line_order",
                (case["id"],),
            ).fetchall()

        rows: list[dict[str, Any]] = []
        for idx, line in enumerate(lines):
            original_lot = line.get("original_label_lot_no") or ""
            created_lot_no = line.get("created_lot_no") or ""
            suggested = ""
            if not created_lot_no and original_lot:
                from app.services.lot2526.extractor import suggest_created_lot_no
                suggested = suggest_created_lot_no(str(original_lot))
            qty = line.get("return_qty_from_dc")
            physical_qty = line.get("physical_lot_qty")
            rows.append({
                "row_index": idx,
                "original_label_lot_no": str(original_lot),
                "date_code": str(line.get("date_code") or ""),
                "return_qty_from_dc": "" if qty is None else str(qty),
                "created_lot_no": str(created_lot_no),
                "suggested_created_lot_no": suggested,
                "date_created": self._format_cell_date(line.get("date_created")),
                "created_date_code": str(line.get("created_date_code") or ""),
                "physical_lot_qty": "" if physical_qty is None else str(physical_qty),
                "lot_code": str(line.get("lot_code") or ""),
            })
        return {
            "case_no": case_no,
            "test_bau": str(case.get("test_bau") or ""),
            "dn_number": str(case.get("dn_number") or ""),
            "rows": rows,
        }

    def update_row_lot_creation_fields(self, case_no: int, row_index: int, fields: dict[str, Any]) -> None:
        """Writes directly into an existing line's lot-creation fields.
        row_index is re-resolved fresh against the case's current
        line_order values (same ordering get_case_detail() uses)."""
        try:
            with db.bypass_connection() as conn:
                case = conn.execute(
                    "select id from lot2526_cases where case_no = %s", (case_no,)
                ).fetchone()
                if case is None:
                    raise Lot2526ExcelError(f"Case No. {case_no} not found in the 2526 worksheet")
                line = conn.execute(
                    "select id from lot2526_lot_lines where case_id = %s and line_order = %s",
                    (case["id"], row_index),
                ).fetchone()
                if line is None:
                    raise Lot2526ExcelError(f"Row {row_index} not found in case No. {case_no}")
                update_fields = self._prepare_fields(fields, _LOT_CREATION_FIELDS)
                if update_fields:
                    set_clause = ", ".join(f"{k} = %s" for k in update_fields)
                    conn.execute(
                        f"update lot2526_lot_lines set {set_clause} where id = %s",
                        list(update_fields.values()) + [line["id"]],
                    )
        except Lot2526ExcelError:
            raise
        except Exception as exc:
            self._log_pg_write_failure("update_row_lot_creation_fields", exc)
            raise Lot2526ExcelError(f"Failed to update row: {exc}") from exc

    def append_lot_creation_entry(self, case_no: int, fields: dict[str, Any]) -> None:
        """Secondary action: adds a brand-new lot line to an existing case
        carrying only the 5 lot-creation fields, for when a case needs an
        extra entry beyond its 1:1 original-lot mapping (e.g. a
        merged-wafer split into more than one created lot)."""
        try:
            with db.bypass_connection() as conn:
                case = conn.execute(
                    "select id from lot2526_cases where case_no = %s", (case_no,)
                ).fetchone()
                if case is None:
                    raise Lot2526ExcelError(f"Case No. {case_no} not found in the 2526 worksheet")
                max_order = conn.execute(
                    "select max(line_order) as m from lot2526_lot_lines where case_id = %s",
                    (case["id"],),
                ).fetchone()["m"]
                next_order = (max_order if max_order is not None else -1) + 1
                insert_fields = self._prepare_fields(fields, _LOT_CREATION_FIELDS)
                columns = ["case_id", "line_order"] + list(insert_fields.keys())
                values = [case["id"], next_order] + list(insert_fields.values())
                placeholders = ", ".join(["%s"] * len(columns))
                conn.execute(
                    f"insert into lot2526_lot_lines ({', '.join(columns)}) values ({placeholders})",
                    values,
                )
        except Lot2526ExcelError:
            raise
        except Exception as exc:
            self._log_pg_write_failure("append_lot_creation_entry", exc)
            raise Lot2526ExcelError(f"Failed to add lot entry: {exc}") from exc

    def reset_all_data_rows(self) -> int:
        """Removes every case (and its lines, via ON DELETE CASCADE) so
        the next save starts fresh at case No. 1. Returns the number of
        lot lines removed."""
        try:
            with db.bypass_connection() as conn:
                removed = conn.execute("select count(*) as n from lot2526_lot_lines").fetchone()["n"]
                conn.execute("delete from lot2526_cases")
            return removed
        except Exception as exc:
            self._log_pg_write_failure("reset_all_data_rows", exc)
            raise Lot2526ExcelError(f"Failed to reset 2526 data: {exc}") from exc

    # --- Export only (ExcelService.generate_export_workbook()) ---

    def _write_case_group(self, ws, start_row: int, case_no: int, group: list[dict[str, Any]]) -> None:
        for i, fields in enumerate(group):
            row = start_row + i
            if i == 0:
                case_cell = ws.cell(row=row, column=1, value=case_no)
                case_cell.alignment = _CELL_ALIGNMENT
            for offset, field in enumerate(_COLUMNS, start=2):
                if field == "test_bau" and i > 0:
                    continue  # only the case's first row shows Test Bau
                value = fields.get(field)
                if value in (None, ""):
                    continue
                cell = ws.cell(row=row, column=offset, value=value)
                cell.alignment = _CELL_ALIGNMENT
                if field == "date_attached_ss_plan":
                    cell.number_format = DATE_NUMBER_FORMAT
            self._write_lot_creation_fields(ws, row, fields)

    @staticmethod
    def _write_subtotal_row(ws, row: int, group: list[dict[str, Any]]) -> None:
        total = 0.0
        for fields in group:
            try:
                total += float(str(fields.get("return_qty_from_dc") or "0").replace(",", ""))
            except (TypeError, ValueError):
                continue
        total_value: float | int = int(total) if total == int(total) else total
        col = 2 + _COLUMNS.index("return_qty_from_dc")
        cell = ws.cell(row=row, column=col, value=total_value)
        cell.font = Font(bold=True)
        cell.alignment = _CELL_ALIGNMENT

    @staticmethod
    def _write_lot_creation_fields(ws, row: int, fields: dict[str, Any]) -> None:
        date_created_raw = fields.get("date_created")
        if date_created_raw:
            date_value = _coerce_date(date_created_raw)
            cell = ws.cell(row=row, column=_LOT_CREATION_COLUMN_OFFSET, value=date_value)
            cell.number_format = DATE_NUMBER_FORMAT
            cell.alignment = _CELL_ALIGNMENT

        for offset, key in enumerate(_LOT_CREATION_FIELDS[1:], start=_LOT_CREATION_COLUMN_OFFSET + 1):
            value = fields.get(key)
            if value in (None, ""):
                continue
            cell = ws.cell(row=row, column=offset, value=value)
            cell.alignment = _CELL_ALIGNMENT

    def write_full_export(self, ws, cases: list[dict[str, Any]]) -> None:
        """Rebuilds the whole sheet from scratch onto an already-open
        worksheet (used only by ExcelService.generate_export_workbook()).
        Row spacing intentionally packs cases back-to-back with no blank
        separator row, even after a subtotal row - verified against real
        accumulated production data that separator rows never actually
        survive there in practice (the live-write path's per-call
        _next_blank_row-style scan naturally reclaimed any reserved gap on
        the next case added). `cases` is [{"case_no": int, "lines":
        [{...same field names as _COLUMNS[1:] + _LOT_CREATION_FIELDS,
        including "test_bau"...}, ...]}, ...], already in order."""
        row = 2
        for case in cases:
            group = case["lines"] or [{}]
            self._write_case_group(ws, row, case["case_no"], group)
            row += len(group)
            if len(group) > 1:
                self._write_subtotal_row(ws, row, group)
                row += 1
