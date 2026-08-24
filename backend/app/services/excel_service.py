import json
import shutil
from io import BytesIO
from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook

from app.services import db
from app.services.excel_layout import (
    WorksheetLayout,
    copy_row_formatting,
    load_active_worksheet_name,
    write_mapped_values,
)
from app.services.status_utils import normalize_record_status
from app.models.schemas import ExistingMasterRecord
from config.settings import (
    FIELD_MAPPING_PATH,
    MASTERFILE_DIR,
    MASTERFILE_FALLBACK,
    MASTERFILE_PATH,
    WORKSHEET_CONFIG_PATH,
    resolve_masterfile_path,
)

def _to_numeric(value: Any) -> float | int | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None

# The real FY2526/FY2627/FY2728 header row (31 columns; 6 are confirmed
# permanently empty across the entire backup history - see the migration
# plan's Open Questions - and so have no Postgres column / field key).
# Static because header text doesn't change once Excel stops being the
# live target - get_worksheet_rows() needs this for its `headers` response
# without a worksheet to scan anymore.
_MASTERFILE_HEADERS: list[tuple[int, str, str | None]] = [
    (1, "Case_ID", "case_id"),
    (2, "FY", "fy"),
    (3, "DN Creation Date", "dn_date"),
    (4, "Data source", "data_source"),
    (5, "QMR/SAP no./Jira", "rma_number"),
    (6, "STORE Received", "store_received"),
    (7, "QE Received\n(check)", None),
    (8, "Recd LW", "recd_lw"),
    (9, "Recd Mth", "recd_mth"),
    (10, "DN / Invoice No.", "dn_number"),
    (11, "Type of Return", "type_of_return"),
    (12, "Device", "device"),
    (13, "Package", "package"),
    (14, "GF", "gf"),
    (15, "Date code", "date_code"),
    (16, "DC Bau", "dc_bau"),
    (17, "Test Bau", "test_bau"),
    (18, "VKL Bau", "vkl_bau"),
    (19, "Qty   (pcs)", "quantity"),
    (20, "DC", "dc"),
    (21, "Owner", "owner"),
    (22, "Rework Flow Procedure", "rework_flow_procedure"),
    (23, "Cause Owner", "cause_owner"),
    (24, "Case Title", "case_title"),
    (25, "Lot Create LW", None),
    (26, "Store \n(Lot no / Qty)", "store_lot_qty"),
    (27, "Store\nLot Creation (Date)", None),
    (28, "Store\n(Plan to do)", None),
    (29, "Status", "status"),
    (30, "TSP", None),
    (31, "SS Plan", None),
]

# Shipped with the API so fresh deploys / empty disks can bootstrap.
_PACKAGED_TEMPLATE = Path(__file__).resolve().parents[2] / "assets" / "master-template.xlsx"


class ExcelServiceError(Exception):
    pass


class ExcelLockedError(ExcelServiceError):
    pass


class ExcelService:
    """
    Updates the existing master workbook in-place.
    Preserves template layout, formatting, filters, and formulas.
    Only appends or updates data rows on the configured worksheet.
    """

    def __init__(self, worksheet_name: str | None = None) -> None:
        self.worksheet_name = worksheet_name or load_active_worksheet_name()
        self._worksheet_config = self._load_worksheet_config()

    @property
    def masterfile_path(self) -> Path:
        return resolve_masterfile_path()

    def _load_worksheet_config(self) -> dict[str, Any]:
        with open(WORKSHEET_CONFIG_PATH, encoding="utf-8") as f:
            root = json.load(f)
        worksheets = root.get("worksheets", {})
        if self.worksheet_name not in worksheets:
            raise ExcelServiceError(
                f"Worksheet '{self.worksheet_name}' is not configured in worksheet_config.json"
            )
        return worksheets[self.worksheet_name]

    # --- Phase 3: Postgres is the sole store for this worksheet's records.
    # Excel is generated fresh from these same queries on demand (see
    # generate_export_workbook()), never read live by the methods below. ---

    def _max_case_id(self, conn, active_only: bool) -> int:
        """Mirrors WorksheetLayout.get_max_case_id(): only purely-numeric
        case_ids count (revision suffixes like "1866-R1" are excluded),
        matching int(float(str(value))) silently skipping those there."""
        where = "fy = %s and case_id ~ '^[0-9]+$'"
        params: list[Any] = [self.worksheet_name]
        if active_only:
            where += " and lower(coalesce(status, '')) not in ('deleted', 'archived')"
        row = conn.execute(
            f"select max(case_id::bigint) as m from rma_masterfile_records where {where}", params
        ).fetchone()
        return int(row["m"]) if row and row["m"] is not None else 0

    @staticmethod
    def _pg_row_to_record(row: dict[str, Any]) -> dict[str, Any]:
        """Matches WorksheetLayout.row_to_record()'s shape (field_mapping.json
        field names + row_number, quantity/status normalized the same way)
        so downstream consumers (SQLite index upsert, ExistingMasterRecord
        construction, etc.) need no changes."""
        record = {k: v for k, v in row.items() if k not in ("id", "created_at", "updated_at") and v is not None}
        if "quantity" in record:
            record["quantity"] = _to_numeric(record["quantity"])
        if "case_id" in record:
            record["case_id"] = str(record["case_id"])
        if "status" in record:
            record["status"] = normalize_record_status(record["status"])
        record.setdefault("row_number", 0)
        return record

    def _log_pg_write_failure(self, action: str, exc: Exception) -> None:
        from app.services.audit_logger import AuditLogger
        AuditLogger().log(
            filename="postgres-write", dn_number=self.worksheet_name, action=f"Postgres Write ({action})",
            status="FAILED", user="System", details=str(exc)[:500],
        )

    def ensure_masterfile_exists(self) -> None:
        """Ensure a usable master workbook exists (seed from packaged template if needed)."""
        if resolve_masterfile_path().exists():
            return

        MASTERFILE_DIR.mkdir(parents=True, exist_ok=True)
        if _PACKAGED_TEMPLATE.exists():
            target = MASTERFILE_PATH if not MASTERFILE_FALLBACK.exists() else MASTERFILE_FALLBACK
            if not target.exists():
                shutil.copy2(_PACKAGED_TEMPLATE, target)
            return

        # Last resort: minimal workbook from field_mapping + worksheet_config
        self._create_minimal_masterfile(MASTERFILE_PATH)

    def _create_minimal_masterfile(self, path: Path) -> None:
        with open(WORKSHEET_CONFIG_PATH, encoding="utf-8") as f:
            ws_root = json.load(f)
        with open(FIELD_MAPPING_PATH, encoding="utf-8") as f:
            field_mapping = json.load(f)

        headers: list[str] = []
        seen: set[str] = set()
        for aliases in field_mapping.get("pdf_to_excel_headers", {}).values():
            if not aliases:
                continue
            label = str(aliases[0]).strip()
            key = label.lower()
            if key in seen:
                continue
            seen.add(key)
            headers.append(label)

        if not headers:
            raise ExcelServiceError("Cannot bootstrap masterfile: field_mapping has no headers")

        wb = Workbook()
        # Remove default sheet; recreate configured worksheets
        default = wb.active
        wb.remove(default)
        for name in ws_root.get("worksheets", {}).keys():
            ws = wb.create_sheet(name)
            for col, header in enumerate(headers, start=1):
                ws.cell(row=1, column=col, value=header)
        if not wb.sheetnames:
            ws = wb.create_sheet("FY2526")
            for col, header in enumerate(headers, start=1):
                ws.cell(row=1, column=col, value=header)
        path.parent.mkdir(parents=True, exist_ok=True)
        wb.save(path)
        wb.close()

    def _open_workbook(self):
        self.ensure_masterfile_exists()
        try:
            return load_workbook(self.masterfile_path)
        except PermissionError as exc:
            raise ExcelLockedError(
                "Master Excel file is locked. Close it in Excel and try again."
            ) from exc

    def _get_layout(self, wb) -> tuple[Any, WorksheetLayout]:
        if self.worksheet_name not in wb.sheetnames:
            raise ExcelServiceError(
                f"Worksheet '{self.worksheet_name}' not found in masterfile"
            )
        ws = wb[self.worksheet_name]
        layout = WorksheetLayout.from_config_files(ws, self.worksheet_name)
        return ws, layout

    def get_detected_headers(self) -> dict[str, Any]:
        wb = self._open_workbook()
        try:
            _, layout = self._get_layout(wb)
            return {
                "worksheet": self.worksheet_name,
                "headers": layout.headers_by_col,
                "pdf_field_mapping": {
                    field: layout.headers_by_col.get(col)
                    for field, col in layout.pdf_field_to_col.items()
                },
            }
        finally:
            wb.close()

    def get_all_dn_numbers(self) -> set[str]:
        with db.bypass_connection() as conn:
            rows = conn.execute(
                "select distinct dn_number from rma_masterfile_records "
                "where fy = %s and dn_number is not null and dn_number != ''",
                (self.worksheet_name,),
            ).fetchall()
        return {str(r["dn_number"]).strip() for r in rows}

    def get_last_case_id(self) -> int:
        with db.bypass_connection() as conn:
            return self._max_case_id(conn, active_only=True)

    def _prepare_insert_row(
        self, ws, layout: WorksheetLayout, record: dict[str, Any]
    ) -> tuple[int, dict[str, Any], int]:
        """Resolve target row, optionally reuse soft-deleted row for Case_ID 1."""
        target_row, case_override = layout.resolve_insert_target()
        payload = dict(record)
        if case_override is not None:
            payload["_case_id_override"] = case_override
        else:
            last_row = layout.find_last_populated_row()
            template_row = self._format_template_row(layout, last_row)
            if target_row != template_row:
                copy_row_formatting(ws, template_row, target_row)
        return target_row, payload, layout.find_last_populated_row()

    def _format_template_row(self, layout: WorksheetLayout, last_populated: int) -> int:
        if last_populated > layout.header_row:
            return last_populated
        return layout.data_start_row

    def insert_record(self, record: dict[str, Any]) -> int:
        wb = self._open_workbook()
        try:
            ws, layout = self._get_layout(wb)
            target_row, payload, _ = self._prepare_insert_row(ws, layout, record)
            values = layout.build_cell_values(payload)
            write_mapped_values(ws, target_row, values)

            case_col = layout.get_case_id_column()
            case_id = int(ws.cell(row=target_row, column=case_col).value)

            wb.save(self.masterfile_path)
            return case_id
        except PermissionError as exc:
            raise ExcelLockedError(
                "Master Excel file is locked. Close it in Excel and try again."
            ) from exc
        finally:
            wb.close()

    def replace_record(self, dn_number: str, record: dict[str, Any]) -> int:
        wb = self._open_workbook()
        try:
            ws, layout = self._get_layout(wb)
            row = layout.find_row_by_dn(dn_number)
            if row is None:
                raise ExcelServiceError(f"DN Number {dn_number} not found for replacement")

            case_col = layout.get_case_id_column()
            existing_case_id = ws.cell(row=row, column=case_col).value

            values = layout.build_cell_values(record)
            values.pop(case_col, None)
            write_mapped_values(ws, row, values)

            case_id = int(existing_case_id) if existing_case_id else layout.get_max_case_id()
            wb.save(self.masterfile_path)
            return case_id
        except PermissionError as exc:
            raise ExcelLockedError(
                "Master Excel file is locked. Close it in Excel and try again."
            ) from exc
        finally:
            wb.close()

    def get_all_master_records(self) -> list[dict[str, Any]]:
        with db.bypass_connection() as conn:
            rows = conn.execute(
                "select * from rma_masterfile_records where fy = %s", (self.worksheet_name,)
            ).fetchall()
        return [
            self._pg_row_to_record(r) for r in rows
            if r.get("dn_number") or r.get("case_id")
        ]

    def get_existing_record_by_dn(self, dn_number: str) -> ExistingMasterRecord | None:
        with db.bypass_connection() as conn:
            row = conn.execute(
                "select * from rma_masterfile_records where fy = %s and dn_number = %s limit 1",
                (self.worksheet_name, dn_number),
            ).fetchone()
        if row is None:
            return None
        rec = self._pg_row_to_record(row)
        return ExistingMasterRecord(
            case_id=str(rec.get("case_id", "")),
            row_number=int(rec.get("row_number") or 0),
            dn_number=str(rec.get("dn_number", "")),
            rma_number=str(rec.get("rma_number", "")),
            device=str(rec.get("device", "")),
            package=str(rec.get("package", "")),
            quantity=str(rec.get("quantity", "")),
            owner=str(rec.get("owner", "")),
            date_code=str(rec.get("date_code", "")),
            store_received=str(rec.get("store_received", "")),
            case_title=str(rec.get("case_title", "")),
            type_of_return=str(rec.get("type_of_return", "")),
            gf=str(rec.get("gf", "")),
            dc=str(rec.get("dc", "")),
        )

    def search_records(
        self,
        case_id: str = "",
        dn_number: str = "",
        device: str = "",
        owner: str = "",
        package: str = "",
        sap_number: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        records = self.get_all_master_records()
        results: list[dict[str, Any]] = []

        def match(field_val: Any, query: str) -> bool:
            if not query:
                return True
            return query.strip().lower() in str(field_val or "").lower()

        for rec in records:
            if not match(rec.get("case_id"), case_id):
                continue
            if not match(rec.get("dn_number"), dn_number):
                continue
            if not match(rec.get("device"), device):
                continue
            if not match(rec.get("owner"), owner):
                continue
            if not match(rec.get("package"), package):
                continue
            if not match(rec.get("rma_number"), sap_number):
                continue
            results.append(rec)
            if len(results) >= limit:
                break
        return results

    def insert_revision(self, base_case_id: str, record: dict[str, Any]) -> int:
        wb = self._open_workbook()
        try:
            ws, layout = self._get_layout(wb)
            revision_id = layout.next_revision_case_id(base_case_id)
            record = {**record, "_case_id_override": revision_id}

            last_row = layout.find_last_populated_row()
            target_row = max(last_row + 1, layout.data_start_row)
            template_row = self._format_template_row(layout, last_row)
            if target_row != template_row:
                copy_row_formatting(ws, template_row, target_row)

            values = layout.build_cell_values(record)
            write_mapped_values(ws, target_row, values)
            wb.save(self.masterfile_path)
            return revision_id
        except PermissionError as exc:
            raise ExcelLockedError(
                "Master Excel file is locked. Close it in Excel and try again."
            ) from exc
        finally:
            wb.close()

    def force_insert_record(self, record: dict[str, Any]) -> int:
        """Insert even when DN already exists — creates new Case_ID."""
        return self.insert_record(record)

    def get_row_before_after(
        self, dn_number: str, new_record: dict[str, Any]
    ) -> dict[str, Any]:
        """Preview existing row vs proposed changes for replace."""
        existing = self.get_existing_record_by_dn(dn_number)
        if not existing:
            return {"before": None, "after": new_record}
        before = existing.model_dump()
        after = {**before, **{k: v for k, v in new_record.items() if v not in (None, "")}}
        diffs: dict[str, dict[str, str]] = {}
        for key in set(before) | set(after):
            if key in ("row_number",):
                continue
            old_v = str(before.get(key, "") or "")
            new_v = str(after.get(key, "") or "")
            if old_v != new_v:
                diffs[key] = {"existing": old_v, "new": new_v}
        return {"before": before, "after": after, "differences": diffs}

    def get_total_records(self) -> int:
        return len(self.get_all_dn_numbers())

    def get_masterfile_path(self) -> Path:
        self.ensure_masterfile_exists()
        return self.masterfile_path

    def get_worksheet_rows(self, search: str = "", limit: int = 500) -> dict[str, Any]:
        headers = [{"col": col, "label": label} for col, label, _field in _MASTERFILE_HEADERS]
        field_to_header = {field: label for _col, label, field in _MASTERFILE_HEADERS if field}

        with db.bypass_connection() as conn:
            pg_rows = conn.execute(
                "select * from rma_masterfile_records where fy = %s order by row_number nulls last, case_id",
                (self.worksheet_name,),
            ).fetchall()

        query = search.strip().lower()
        rows: list[dict[str, Any]] = []
        for row_num, pg_row in enumerate(pg_rows, start=2):
            if not (pg_row.get("dn_number") or pg_row.get("case_id")):
                continue
            row_data: dict[str, Any] = {"_row": row_num}
            for field, label in field_to_header.items():
                row_data[label] = pg_row.get(field)
            if query:
                haystack = " ".join(str(v) for v in row_data.values() if v is not None).lower()
                if query not in haystack:
                    continue
            rows.append(row_data)
            if len(rows) >= limit:
                break

        with db.bypass_connection() as conn:
            last_case_id = self._max_case_id(conn, active_only=True)

        return {
            "worksheet": self.worksheet_name,
            "headers": headers,
            "rows": rows,
            "total": len(rows),
            "last_case_id": last_case_id,
        }

    def get_worksheet_config(self) -> dict[str, Any]:
        with open(WORKSHEET_CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)

    # --- Batch session: Postgres writes, one call per operation ---

    class _BatchSession:
        """Phase 3: Postgres-backed - the masterfile's sole write target.
        Same public method names/signatures as before this became
        Postgres-backed (record_service.py/processing_service.py need no
        changes), but case-ID generation, DN/case-ID lookups, and revision
        numbering now query Postgres directly instead of scanning an
        in-memory openpyxl worksheet, which would go stale the instant
        Excel stopped being written and could no longer be trusted for any
        of this. Every method commits immediately (autocommit-per-call via
        db.bypass_connection()); save()/close() are no-ops kept only so
        callers using them as a batch/lock scope don't need to change."""

        _WRITABLE_FIELDS = [
            "data_source", "status", "dn_number", "dn_date", "store_received",
            "recd_lw", "recd_mth", "rma_number", "type_of_return", "device",
            "package", "gf", "date_code", "dc_bau", "test_bau", "vkl_bau",
            "quantity", "dc", "owner", "rework_flow_procedure", "cause_owner",
            "case_title", "store_lot_qty",
        ]

        def __init__(self, service: "ExcelService") -> None:
            self.service = service
            self.fy = service.worksheet_name

        def save(self) -> None:
            pass

        def close(self) -> None:
            pass

        @staticmethod
        def _build_fields(record: dict[str, Any]) -> dict[str, Any]:
            """Mirrors WorksheetLayout.build_cell_values()'s field_sources
            defaulting rules (same config, backend/config/field_mapping.json's
            config_defaults) - same skip-empty-values behavior too, which is
            why update_record() below can't clear a field by setting it to
            "" (matches the Excel version's existing behavior exactly, not a
            new limitation)."""
            fields = {
                "data_source": record.get("data_source") or "SAP DN",
                "status": normalize_record_status(record.get("status") or "Open"),
                "dn_number": record.get("dn_number", ""),
                "dn_date": record.get("dn_date", ""),
                "store_received": record.get("store_received") or record.get("dn_date", ""),
                "recd_lw": record.get("recd_lw", ""),
                "recd_mth": record.get("recd_mth", ""),
                "rma_number": record.get("rma_number", ""),
                "type_of_return": record.get("type_of_return", ""),
                "device": record.get("device", ""),
                "package": record.get("package", ""),
                "gf": record.get("gf", ""),
                "date_code": record.get("date_code", ""),
                "dc_bau": record.get("dc_bau", ""),
                "test_bau": record.get("test_bau", ""),
                "vkl_bau": record.get("vkl_bau", ""),
                "quantity": _to_numeric(record.get("quantity", "")),
                "dc": record.get("dc", ""),
                "owner": record.get("owner", ""),
                "rework_flow_procedure": record.get("rework_flow_procedure", ""),
                "cause_owner": record.get("cause_owner", ""),
                "case_title": record.get("case_title", ""),
                "store_lot_qty": record.get("store_lot_qty", ""),
            }
            return {k: v for k, v in fields.items() if v not in ("", None)}

        def _resolve_insert_case_id(self, conn) -> tuple[str, str | None]:
            """Returns (case_id, case_id_to_reuse). Mirrors
            WorksheetLayout.resolve_insert_target(): if there are zero
            active records, reuse the first soft-deleted record's case_id
            (that old record is replaced, not kept alongside the new one)."""
            active = conn.execute(
                "select count(*) as n from rma_masterfile_records where fy = %s "
                "and lower(coalesce(status, '')) not in ('deleted', 'archived')",
                (self.fy,),
            ).fetchone()["n"]
            if active == 0:
                deleted = conn.execute(
                    "select case_id from rma_masterfile_records where fy = %s "
                    "and lower(status) = 'deleted' order by id limit 1",
                    (self.fy,),
                ).fetchone()
                if deleted:
                    return str(deleted["case_id"]), str(deleted["case_id"])
            next_id = self.service._max_case_id(conn, active_only=True)
            return str(next_id + 1 if next_id > 0 else 1), None

        def insert_record(self, record: dict[str, Any]) -> str:
            try:
                with db.bypass_connection() as conn:
                    override = record.get("_case_id_override")
                    if override:
                        case_id, reuse = str(override), None
                    else:
                        case_id, reuse = self._resolve_insert_case_id(conn)
                    if reuse:
                        conn.execute(
                            "delete from rma_masterfile_records where fy = %s and case_id = %s",
                            (self.fy, reuse),
                        )
                    fields = self._build_fields(record)
                    columns = ["fy", "case_id"] + list(fields.keys())
                    values = [self.fy, case_id] + list(fields.values())
                    placeholders = ", ".join(["%s"] * len(columns))
                    conn.execute(
                        f"insert into rma_masterfile_records ({', '.join(columns)}) values ({placeholders})",
                        values,
                    )
                return case_id
            except Exception as exc:
                self.service._log_pg_write_failure("insert_record", exc)
                raise ExcelServiceError(f"Failed to save record: {exc}") from exc

        def replace_record(self, dn_number: str, record: dict[str, Any]) -> str:
            try:
                with db.bypass_connection() as conn:
                    existing = conn.execute(
                        "select case_id from rma_masterfile_records where fy = %s and dn_number = %s limit 1",
                        (self.fy, dn_number),
                    ).fetchone()
                    if existing is None:
                        raise ExcelServiceError(f"DN Number {dn_number} not found for replacement")
                    case_id = str(existing["case_id"])
                    fields = self._build_fields(record)
                    if fields:
                        set_clause = ", ".join(f"{k} = %s" for k in fields)
                        conn.execute(
                            f"update rma_masterfile_records set {set_clause}, updated_at = now() "
                            f"where fy = %s and case_id = %s",
                            list(fields.values()) + [self.fy, case_id],
                        )
                return case_id
            except ExcelServiceError:
                raise
            except Exception as exc:
                self.service._log_pg_write_failure("replace_record", exc)
                raise ExcelServiceError(f"Failed to replace record: {exc}") from exc

        def insert_revision(self, base_case_id: str, record: dict[str, Any]) -> str:
            try:
                with db.bypass_connection() as conn:
                    existing_ids = {
                        str(r["case_id"])
                        for r in conn.execute(
                            "select case_id from rma_masterfile_records where fy = %s", (self.fy,)
                        ).fetchall()
                    }
                    base = str(base_case_id).strip()
                    revision = 1
                    while f"{base}-R{revision}" in existing_ids:
                        revision += 1
                    case_id = f"{base}-R{revision}"
                    if case_id in existing_ids:
                        case_id = next(
                            (f"{base}{s}" for s in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if f"{base}{s}" not in existing_ids),
                            f"{base}-R{revision + 1}",
                        )
                    fields = self._build_fields(record)
                    columns = ["fy", "case_id"] + list(fields.keys())
                    values = [self.fy, case_id] + list(fields.values())
                    placeholders = ", ".join(["%s"] * len(columns))
                    conn.execute(
                        f"insert into rma_masterfile_records ({', '.join(columns)}) values ({placeholders})",
                        values,
                    )
                return case_id
            except Exception as exc:
                self.service._log_pg_write_failure("insert_revision", exc)
                raise ExcelServiceError(f"Failed to insert revision: {exc}") from exc

        def set_record_status(self, case_id: str, status: str) -> dict[str, Any]:
            try:
                with db.bypass_connection() as conn:
                    row = conn.execute(
                        "update rma_masterfile_records set status = %s, updated_at = now() "
                        "where fy = %s and case_id = %s returning *",
                        (status, self.fy, case_id),
                    ).fetchone()
                if row is None:
                    raise ExcelServiceError(f"Case ID {case_id} not found")
                return self.service._pg_row_to_record(row)
            except ExcelServiceError:
                raise
            except Exception as exc:
                self.service._log_pg_write_failure("set_record_status", exc)
                raise ExcelServiceError(f"Failed to update status: {exc}") from exc

        def update_record(self, case_id: str, fields_in: dict[str, Any]) -> dict[str, Any]:
            try:
                with db.bypass_connection() as conn:
                    current = conn.execute(
                        "select * from rma_masterfile_records where fy = %s and case_id = %s",
                        (self.fy, case_id),
                    ).fetchone()
                    if current is None:
                        raise ExcelServiceError(f"Case ID {case_id} not found")
                    merged = {**current, **fields_in}
                    fields = self._build_fields(merged)
                    if fields:
                        set_clause = ", ".join(f"{k} = %s" for k in fields)
                        row = conn.execute(
                            f"update rma_masterfile_records set {set_clause}, updated_at = now() "
                            f"where fy = %s and case_id = %s returning *",
                            list(fields.values()) + [self.fy, case_id],
                        ).fetchone()
                    else:
                        row = current
                return self.service._pg_row_to_record(row)
            except ExcelServiceError:
                raise
            except Exception as exc:
                self.service._log_pg_write_failure("update_record", exc)
                raise ExcelServiceError(f"Failed to update record: {exc}") from exc

        def permanent_delete_row(self, case_id: str) -> None:
            try:
                with db.bypass_connection() as conn:
                    cur = conn.execute(
                        "delete from rma_masterfile_records where fy = %s and case_id = %s",
                        (self.fy, case_id),
                    )
                    if cur.rowcount == 0:
                        raise ExcelServiceError(f"Case ID {case_id} not found")
            except ExcelServiceError:
                raise
            except Exception as exc:
                self.service._log_pg_write_failure("permanent_delete_row", exc)
                raise ExcelServiceError(f"Failed to delete record: {exc}") from exc

        def read_all_records(self) -> list[dict[str, Any]]:
            with db.bypass_connection() as conn:
                rows = conn.execute(
                    "select * from rma_masterfile_records where fy = %s", (self.fy,)
                ).fetchall()
            return [
                self.service._pg_row_to_record(r) for r in rows
                if r.get("dn_number") or r.get("case_id")
            ]

    def batch_session(self) -> _BatchSession:
        return ExcelService._BatchSession(self)

    def soft_delete_record(self, case_id: str) -> dict[str, Any]:
        session = self.batch_session()
        try:
            rec = session.set_record_status(case_id, "Deleted")
            session.save()
            return rec
        finally:
            session.close()

    def restore_record(self, case_id: str) -> dict[str, Any]:
        session = self.batch_session()
        try:
            rec = session.set_record_status(case_id, "Active")
            session.save()
            return rec
        finally:
            session.close()

    def permanent_delete_record(self, case_id: str) -> None:
        session = self.batch_session()
        try:
            session.permanent_delete_row(case_id)
            session.save()
        finally:
            session.close()

    def update_record_by_case_id(self, case_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        session = self.batch_session()
        try:
            rec = session.update_record(case_id, fields)
            session.save()
            return rec
        finally:
            session.close()

    def get_record_by_case_id(self, case_id: str) -> dict[str, Any] | None:
        with db.bypass_connection() as conn:
            row = conn.execute(
                "select * from rma_masterfile_records where fy = %s and case_id = %s",
                (self.worksheet_name, case_id),
            ).fetchone()
        return self._pg_row_to_record(row) if row else None

    def generate_export_workbook(self) -> bytes:
        """Phase 3: builds a fresh .xlsx from Postgres on demand, using the
        packaged template's headers/formatting/formulas as the starting
        point and this module's existing header-mapping-driven cell-writing
        machinery (WorksheetLayout.build_cell_values / write_mapped_values /
        copy_row_formatting - the same functions every other write path in
        this file already uses, not rewritten for this). Returns the raw
        .xlsx bytes; callers (the /download route, BackupService) decide
        what to do with them."""
        from app.services.lot2526.excel_writer import Lot2526ExcelWriter

        template_path = _PACKAGED_TEMPLATE if _PACKAGED_TEMPLATE.exists() else self.masterfile_path
        wb = load_workbook(template_path)

        with open(WORKSHEET_CONFIG_PATH, encoding="utf-8") as f:
            fy_names = list(json.load(f).get("worksheets", {}).keys())

        with db.bypass_connection() as conn:
            for fy in fy_names:
                if fy not in wb.sheetnames:
                    continue
                ws = wb[fy]
                layout = WorksheetLayout.from_config_files(ws, fy)
                # The packaged template asset has been found to carry
                # leftover data rows from whenever it was last snapshotted
                # (a pre-existing issue, not something this export causes) -
                # clear any existing data before writing Postgres's actual
                # current rows, so a stale/dirty template can never leak
                # phantom records into an export.
                for row in range(layout.data_start_row, ws.max_row + 1):
                    for col in range(1, ws.max_column + 1):
                        ws.cell(row=row, column=col).value = None
                pg_rows = conn.execute(
                    "select * from rma_masterfile_records where fy = %s "
                    "order by row_number nulls last, case_id",
                    (fy,),
                ).fetchall()

                target_row = layout.data_start_row
                for pg_row in pg_rows:
                    record = {
                        k: v for k, v in pg_row.items()
                        if k not in ("id", "created_at", "updated_at", "fy", "case_id")
                    }
                    record["_case_id_override"] = pg_row["case_id"]
                    template_row = self._format_template_row(layout, target_row - 1)
                    if target_row != template_row:
                        copy_row_formatting(ws, template_row, target_row)
                    values = layout.build_cell_values(record)
                    write_mapped_values(ws, target_row, values)
                    target_row += 1

            if "2526" in wb.sheetnames:
                case_rows = conn.execute(
                    "select * from lot2526_cases order by case_no"
                ).fetchall()
                line_rows = conn.execute(
                    "select * from lot2526_lot_lines order by case_id, line_order"
                ).fetchall()

        if "2526" in wb.sheetnames:
            ws_2526 = wb["2526"]
            for row in range(2, ws_2526.max_row + 1):
                for col in range(1, ws_2526.max_column + 1):
                    ws_2526.cell(row=row, column=col).value = None
            lines_by_case: dict[int, list[dict[str, Any]]] = {}
            for line in line_rows:
                lines_by_case.setdefault(line["case_id"], []).append(line)
            cases = []
            for case in case_rows:
                lines = []
                for line in lines_by_case.get(case["id"], []):
                    entry = dict(line)
                    entry["test_bau"] = case["test_bau"]
                    lines.append(entry)
                cases.append({"case_no": case["case_no"], "lines": lines})
            Lot2526ExcelWriter().write_full_export(wb["2526"], cases)

        buffer = BytesIO()
        wb.save(buffer)
        wb.close()
        return buffer.getvalue()

    def sync_index_from_excel(self) -> int:
        """SQLite index sync. Despite the name (kept for caller
        compatibility), this reads from Postgres now via
        get_all_master_records() - Postgres, not Excel, is where records
        actually live once Excel stops being written."""
        from app.services.index_db import get_index
        records = self.get_all_master_records()
        return get_index().sync_from_records(records, self.worksheet_name)

    def reset_all_data_rows(self) -> int:
        """Remove every record for this worksheet so the next insert starts
        at Case_ID 1. Phase 3: Postgres-only - a failure here is loud and
        real (raises), matching _BatchSession's write methods, since there
        is no Excel fallback to quietly diverge from anymore."""
        try:
            with db.bypass_connection() as conn:
                cur = conn.execute(
                    "delete from rma_masterfile_records where fy = %s", (self.worksheet_name,)
                )
                removed = cur.rowcount
        except Exception as exc:
            self._log_pg_write_failure("reset_all_data_rows", exc)
            raise ExcelServiceError(f"Failed to reset masterfile: {exc}") from exc
        self.sync_index_from_excel()
        return removed
