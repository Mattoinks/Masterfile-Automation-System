import shutil
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from app.models.schemas import (
    DuplicateAction,
    DuplicateStatusType,
    ExistingMasterRecord,
    ExtractedRecord,
    ProcessResponse,
    RecordStatus,
    SaveRecordRequest,
    SaveResponse,
    StatsResponse,
)
from app.services.analytics_service import AnalyticsService
from app.services.audit_logger import AuditLogger
from app.services.autofill_service import AutofillService
from app.services.backup_service import BackupService
from app.services.duplicate_service import DuplicateService
from app.services.excel_service import ExcelLockedError, ExcelService, ExcelServiceError
from app.services.index_db import get_index
from app.services.lock_service import ExcelLockService
from app.services.pdf_analysis_service import PdfAnalysisService
from app.services.pdf_extractor import PDFExtractionError, consolidate_extractions_by_dn, extract_dn_data
from app.services.processing_progress import get_processing_progress
from app.services.permissions import require_permission
from app.services.validation import validate_record
from config.settings import PDF_PROCESS_WORKERS, PROCESSED_DIR, UPLOADS_DIR


class ProcessingService:
    def __init__(self) -> None:
        self.excel = ExcelService()
        self.autofill = AutofillService()
        self.logger = AuditLogger()
        self.duplicates = DuplicateService()
        self.backup = BackupService()
        self.lock = ExcelLockService()
        self.analytics = AnalyticsService()
        self.pdf_analysis = PdfAnalysisService(autofill=self.autofill)
        self._pending_records: dict[str, ExtractedRecord] = {}

    BUSINESS_FIELDS = [
        "dn_number", "dn_date", "customer_name", "device", "package", "quantity",
        "lot_number", "material_number", "rma_number", "plant_code",
        "store_received", "recd_lw", "recd_mth", "type_of_return", "gf",
        "date_code", "dc_bau", "test_bau", "vkl_bau", "dc", "owner",
        "rework_flow_procedure", "cause_owner", "case_title", "store_lot_qty",
        "data_source", "matched_historical_dn", "matched_historical_case_id",
    ]

    def save_uploads(self, files: list[tuple[str, bytes]]) -> list[str]:
        saved: list[str] = []
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        for filename, content in files:
            if not filename.lower().endswith(".pdf"):
                continue
            dest = UPLOADS_DIR / filename
            dest.write_bytes(content)
            saved.append(filename)
        return saved

    def _load_master_records_from_index(self) -> list[ExistingMasterRecord]:
        index = get_index()
        rows = index.get_all_active_records()
        if not rows:
            self.excel.sync_index_from_excel()
            rows = index.get_all_active_records()
        records: list[ExistingMasterRecord] = []
        for row in rows:
            fields = row.get("fields") or row
            if not fields.get("dn_number") and not fields.get("case_id"):
                continue
            records.append(ExistingMasterRecord(
                case_id=str(fields.get("case_id", row.get("case_id", ""))),
                row_number=int(fields.get("row_number", row.get("row_number", 0)) or 0),
                dn_number=str(fields.get("dn_number", row.get("dn_number", ""))),
                rma_number=str(fields.get("rma_number", row.get("rma_number", ""))),
                device=str(fields.get("device", row.get("device", ""))),
                package=str(fields.get("package", row.get("package", ""))),
                quantity=str(fields.get("quantity", row.get("quantity", ""))),
                owner=str(fields.get("owner", row.get("owner", ""))),
                date_code=str(fields.get("date_code", "")),
                store_received=str(fields.get("store_received", "")),
                case_title=str(fields.get("case_title", "")),
                type_of_return=str(fields.get("type_of_return", "")),
                gf=str(fields.get("gf", "")),
                dc=str(fields.get("dc", "")),
            ))
        return records

    def _build_record_from_pdf_data(
        self,
        pdf_data: dict,
        filenames: list[str],
        master_records: list[ExistingMasterRecord],
        on_progress: Callable[[str, str, str], None] | None = None,
    ) -> tuple[ExtractedRecord, str]:
        record_id = str(uuid.uuid4())
        display_name = filenames[0] if len(filenames) == 1 else ", ".join(filenames)

        def report(stage: str, message: str) -> None:
            if on_progress:
                on_progress(display_name, stage, message)

        primary_path = UPLOADS_DIR / filenames[0] if filenames else UPLOADS_DIR / "unknown.pdf"

        try:
            report("autofill", "Applying business rules & history…")
            enriched = self.autofill.enrich(pdf_data)
            field_sources = enriched.get("field_sources", {})
            pdf_values = {
                k: str(v)
                for k, v in pdf_data.items()
                if k in self.BUSINESS_FIELDS and v not in (None, "", [])
            }
            for k, src in field_sources.items():
                if src == "pdf" and enriched.get(k) not in (None, ""):
                    pdf_values[k] = str(enriched[k])

            suggested_values = {
                k: str(enriched.get(k, "") or "")
                for k in self.BUSINESS_FIELDS
                if enriched.get(k) not in (None, "")
            }

            field_diagnostics = {}
            if primary_path.exists():
                field_diagnostics = self.pdf_analysis.diagnose_for_record(
                    primary_path, pdf_data, enriched
                )
            for fld, diag in field_diagnostics.items():
                if not enriched.get(fld) and diag.get("suggested_value"):
                    suggested_values[fld] = diag["suggested_value"]

            record_kwargs = {k: str(enriched.get(k, "") or "") for k in self.BUSINESS_FIELDS}
            record_kwargs.update({
                "filename": display_name,
                "field_sources": field_sources,
                "pdf_values": pdf_values,
                "suggested_values": suggested_values,
                "field_diagnostics": field_diagnostics,
                "record_id": record_id,
            })
            record = ExtractedRecord(**record_kwargs)
        except Exception as exc:
            record = ExtractedRecord(
                filename=display_name,
                status=RecordStatus.INVALID,
                validation_errors=[str(exc)],
                record_id=record_id,
            )

        record = validate_record(record)
        if record.status != RecordStatus.INVALID:
            report("duplicate", "Checking duplicates…")
            match = self.duplicates.analyze(record.model_dump(), master_records)
            record.duplicate_match = match
            record.duplicate_status = match.duplicate_status
            if match.duplicate_status != DuplicateStatusType.NEW:
                record.status = RecordStatus.DUPLICATE
        return record, record_id

    def _process_single_pdf(
        self,
        pdf_path: Path,
        master_records: list[ExistingMasterRecord],
        on_progress: Callable[[str, str, str], None] | None = None,
    ) -> tuple[dict[str, Any], str, list[str]]:
        """Stage 1: raw extraction only (no record yet)."""

        def report(stage: str, message: str) -> None:
            if on_progress:
                on_progress(pdf_path.name, stage, message)

        try:
            report("extracting", f"Extracting {pdf_path.name}…")
            pdf_data = extract_dn_data(pdf_path, on_progress=report)
            return pdf_data, pdf_path.name, []
        except PDFExtractionError as exc:
            return {"dn_number": "", "source_files": [pdf_path.name]}, pdf_path.name, [str(exc)]

    def process_pdfs(self, filenames: list[str] | None = None, user: str = "System") -> ProcessResponse:
        self.excel.ensure_masterfile_exists()
        self.autofill.historical.refresh_if_stale()
        master_records = self._load_master_records_from_index()
        self._pending_records.clear()

        if filenames:
            pdf_files = [UPLOADS_DIR / f for f in filenames if (UPLOADS_DIR / f).exists()]
        else:
            pdf_files = sorted(UPLOADS_DIR.glob("*.pdf"))

        records: list[ExtractedRecord] = []
        valid = invalid = duplicates = exact = possible = 0

        progress = get_processing_progress()
        progress.start(len(pdf_files))

        def on_file_progress(filename: str, stage: str, message: str) -> None:
            page = page_total = None
            if stage == "ocr" and "OCR page" in message:
                try:
                    part = message.split("OCR page", 1)[1].strip()
                    page_str, total_str = part.split("/", 1)
                    page = int(page_str)
                    page_total = int(total_str)
                except (ValueError, IndexError):
                    pass
            progress.update(
                stage=stage,
                message=message,
                current_file=filename,
                page=page,
                page_total=page_total,
            )

        workers = min(PDF_PROCESS_WORKERS, max(1, len(pdf_files)))
        raw_extractions: list[tuple[str, dict]] = []
        extraction_errors: dict[str, list[str]] = {}

        try:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {
                    pool.submit(self._process_single_pdf, pdf_path, master_records, on_file_progress): pdf_path
                    for pdf_path in pdf_files
                }
                for future in as_completed(futures):
                    pdf_path = futures[future]
                    pdf_data, name, errors = future.result()
                    raw_extractions.append((name, pdf_data))
                    if errors:
                        extraction_errors[name] = errors
                    progress.complete_file()

            consolidated = consolidate_extractions_by_dn(raw_extractions)

            for merged_data in consolidated:
                source_files = merged_data.get("source_files") or [merged_data.get("dn_number", "unknown")]
                filenames_list = source_files if isinstance(source_files, list) else [str(source_files)]

                record, record_id = self._build_record_from_pdf_data(
                    merged_data, filenames_list, master_records, on_file_progress
                )

                for fname in filenames_list:
                    if fname in extraction_errors:
                        record.validation_errors.extend(extraction_errors[fname])

                if record.status != RecordStatus.INVALID:
                    if record.status == RecordStatus.DUPLICATE:
                        duplicates += 1
                        self.logger.increment_stat("duplicates_found")
                        if record.duplicate_status == DuplicateStatusType.EXACT:
                            exact += 1
                        else:
                            possible += 1
                    else:
                        valid += 1
                else:
                    invalid += 1

                self._pending_records[record_id] = record
                records.append(record)
                self.logger.log(
                    record.filename,
                    record.dn_number or "N/A",
                    "Upload",
                    record.duplicate_status.value if record.status != RecordStatus.INVALID else record.status.value,
                    user=user,
                    details=f"Merged {len(filenames_list)} PDF(s) → 1 record",
                )
                self.logger.increment_stat("todays_uploads")

            records.sort(key=lambda r: r.dn_number or r.filename)
            progress.finish()
            return ProcessResponse(
                records=records,
                total=len(records),
                valid=valid,
                invalid=invalid,
                duplicates=duplicates,
                exact_duplicates=exact,
                possible_duplicates=possible,
            )
        except Exception:
            progress.reset()
            raise

    def _record_payload(self, record: ExtractedRecord, overrides: dict[str, str]) -> dict:
        data = record.model_dump(mode="json")
        sources = dict(data.get("field_sources") or {})
        for key, value in overrides.items():
            if value is not None and value != "":
                data[key] = value
                sources[key] = "manual"
        data["field_sources"] = sources
        return data

    def preview_save(self, record_id: str, overrides: dict[str, str], action: DuplicateAction) -> dict:
        record = self._pending_records.get(record_id)
        if not record:
            return {"error": "Record not found"}
        payload = self._record_payload(record, overrides)
        dn = payload.get("dn_number", "")

        if action in (DuplicateAction.REPLACE, DuplicateAction.EDIT_EXISTING):
            return self.excel.get_row_before_after(dn, payload)

        next_case = self.excel.get_last_case_id() + 1
        if action == DuplicateAction.REVISION and record.duplicate_match and record.duplicate_match.existing_record:
            base = record.duplicate_match.existing_record.case_id
            wb_preview = self.excel.get_existing_record_by_dn(dn)
            revision = f"{base}-R1" if wb_preview else str(next_case)
            return {
                "before": record.duplicate_match.existing_record.model_dump() if record.duplicate_match.existing_record else None,
                "after": {**payload, "case_id": revision},
                "differences": record.duplicate_match.field_differences,
            }

        return {
            "before": record.duplicate_match.existing_record.model_dump() if record.duplicate_match and record.duplicate_match.existing_record else None,
            "after": {**payload, "case_id": str(next_case)},
            "differences": record.duplicate_match.field_differences if record.duplicate_match else {},
        }

    def save_records(self, save_requests: list[SaveRecordRequest], user: str = "System") -> SaveResponse:
        if self.lock.is_locked_by_other(user):
            lock_status = self.lock.get_status()
            return SaveResponse(
                errors=[f"Masterfile is being edited by {lock_status['user']}. Read-only mode enabled."],
            )

        if not self.lock.acquire(user):
            lock_status = self.lock.get_status()
            return SaveResponse(
                errors=[f"Could not acquire lock. Currently edited by {lock_status['user']}."],
            )

        inserted = skipped = replaced = revised = force_inserted = 0
        errors: list[str] = []
        backup_path: Path | None = None

        try:
            backup_path = self.backup.create_backup()
            session = self.excel.batch_session()
            index = get_index()

            try:
                for req in save_requests:
                    record = self._pending_records.get(req.record_id)
                    if not record:
                        errors.append(f"Record {req.record_id} not found in pending queue")
                        continue

                    payload = self._record_payload(record, req.overrides)
                    dn = payload.get("dn_number", "")
                    action = req.duplicate_action

                    if record.status == RecordStatus.INVALID:
                        skipped += 1
                        self.logger.log(record.filename, dn, "Save", "Skipped - Invalid", user=user)
                        continue

                    is_duplicate = record.status == RecordStatus.DUPLICATE

                    if is_duplicate and action == DuplicateAction.SKIP:
                        skipped += 1
                        self.logger.log(record.filename, dn, "Duplicate Resolution", "Skipped", user=user)
                        continue

                    try:
                        if is_duplicate and action == DuplicateAction.FORCE_INSERT:
                            require_permission(self._role_from_user(user), "force_insert")
                            case_id = session.insert_record(payload)
                            force_inserted += 1
                            record.status = RecordStatus.FORCE_INSERTED
                            self.logger.log(
                                record.filename, dn, "Duplicate Resolution", f"Force Insert Case {case_id}",
                                user=user, details="Created new Case_ID despite duplicate DN",
                            )
                            self.logger.increment_stat("successful_inserts")
                            self._move_to_processed(record.filename)
                            continue

                        if is_duplicate and action == DuplicateAction.REVISION:
                            existing = record.duplicate_match.existing_record if record.duplicate_match else None
                            base_case = existing.case_id if existing else str(self.excel.get_last_case_id())
                            case_id = session.insert_revision(base_case, payload)
                            revised += 1
                            record.status = RecordStatus.REVISION
                            self.logger.log(
                                record.filename, dn, "Duplicate Resolution", f"Revision Case {case_id}",
                                user=user,
                            )
                            self.logger.log_duplicate_resolution(
                                str(case_id), dn, "Create Revision", user,
                                record.duplicate_match.field_differences if record.duplicate_match else {},
                            )
                            self.logger.increment_stat("successful_inserts")
                            self._move_to_processed(record.filename)
                            continue

                        if is_duplicate and action in (DuplicateAction.REPLACE, DuplicateAction.EDIT_EXISTING):
                            preview = self.excel.get_row_before_after(dn, payload)
                            case_id = session.replace_record(dn, payload)
                            replaced += 1
                            record.status = RecordStatus.REPLACED
                            self.logger.log(
                                record.filename, dn, "Duplicate Resolution", f"Case {case_id} Updated",
                                user=user, details="Replace Existing Record",
                            )
                            self.logger.log_duplicate_resolution(
                                str(case_id), dn, "Replace Existing Record", user,
                                preview.get("differences", {}),
                            )
                            self.logger.increment_stat("successful_inserts")
                            self._move_to_processed(record.filename)
                            continue

                        if not is_duplicate:
                            case_id = session.insert_record(payload)
                            inserted += 1
                            record.status = RecordStatus.INSERTED
                            self.logger.log(
                                record.filename, dn, "Insert", "Inserted Successfully",
                                user=user, details=f"Case {case_id}",
                            )
                            self.logger.increment_stat("successful_inserts")
                            self._move_to_processed(record.filename)

                    except PermissionError as exc:
                        errors.append(str(exc))
                    except (ExcelLockedError, ExcelServiceError) as exc:
                        errors.append(f"{dn}: {exc}")

                session.save()
                for rec in session.read_all_records():
                    index.upsert_record(rec, self.excel.worksheet_name)
            finally:
                session.close()

        finally:
            self.lock.release(user)

        return SaveResponse(
            inserted=inserted,
            skipped=skipped,
            replaced=replaced,
            revised=revised,
            force_inserted=force_inserted,
            errors=errors,
            backup_file=backup_path.name if backup_path else None,
        )

    @staticmethod
    def _role_from_user(user: str) -> str:
        if user.lower() in ("admin", "administrator"):
            return "admin"
        if user.lower() == "viewer":
            return "viewer"
        return "engineer"

    def _move_to_processed(self, filename: str) -> None:
        src = UPLOADS_DIR / filename
        if src.exists():
            PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
            dest = PROCESSED_DIR / filename
            if dest.exists():
                dest.unlink()
            shutil.move(str(src), str(dest))

    def get_stats(self) -> StatsResponse:
        cache = self.logger.get_stats()
        index_stats = get_index().stats()
        return StatsResponse(
            total_records=index_stats.get("active", self.excel.get_total_records()),
            todays_uploads=cache.get("todays_uploads", 0),
            duplicates_found=cache.get("duplicates_found", 0),
            successful_inserts=cache.get("successful_inserts", 0),
        )

    def clear_uploads(self) -> None:
        for pdf in UPLOADS_DIR.glob("*.pdf"):
            pdf.unlink()

    def remove_upload(self, filename: str) -> bool:
        """Delete a single uploaded PDF from the queue."""
        safe_name = Path(filename).name
        if not safe_name.lower().endswith(".pdf"):
            return False
        path = UPLOADS_DIR / safe_name
        if not path.exists():
            return False
        path.unlink()
        return True

    def remove_pending_records(self, record_ids: list[str]) -> dict[str, int | list[str]]:
        """Remove records from the review queue without saving to masterfile."""
        removed: list[str] = []
        for record_id in record_ids:
            if record_id in self._pending_records:
                del self._pending_records[record_id]
                removed.append(record_id)
        return {"removed": len(removed), "record_ids": removed}
