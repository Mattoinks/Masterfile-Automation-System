"""Record CRUD with lock, backup, audit, and index sync."""

from __future__ import annotations

from typing import Any

from app.services import masterfile_reader
from app.services.audit_logger import AuditLogger
from app.services.backup_service import BackupService
from app.services.excel_service import ExcelLockedError, ExcelService, ExcelServiceError
from app.services.index_db import DELETED_STATUS, get_index
from app.services.lock_service import ExcelLockService
from app.services.permissions import require_permission


class RecordService:
    def __init__(self) -> None:
        self.excel = ExcelService()
        self.index = get_index()
        self.lock = ExcelLockService()
        self.backup = BackupService()
        self.logger = AuditLogger()

    def _guard_write(self, user: str, role: str, permission: str = "edit") -> None:
        if self.lock.is_locked_by_other(user):
            status = self.lock.get_status()
            raise ExcelLockedError(
                f"Masterfile is being edited by {status['user']}. Read-only mode enabled."
            )
        require_permission(role, permission)
        if not self.lock.acquire(user):
            status = self.lock.get_status()
            raise ExcelLockedError(f"Could not acquire lock. Currently edited by {status['user']}.")

    def _release(self, user: str) -> None:
        self.lock.release(user)

    def _pg_read_failed(self, action: str, exc: Exception) -> None:
        """Phase 2 fail-safe: a Postgres read error is logged loudly (same
        as Track B's dual-write failures) and the caller falls back to the
        pre-Phase-2 path - never a silent gap, never a broken response."""
        self.logger.log(
            filename="postgres-read", dn_number=action, action="Postgres Read",
            status="FAILED", user="System", details=str(exc)[:500],
        )

    def get_record(self, case_id: str) -> dict[str, Any] | None:
        try:
            return masterfile_reader.get_by_case_id(case_id)
        except Exception as exc:
            self._pg_read_failed("get_record", exc)

        cached = self.index.get_by_case_id(case_id)
        if cached:
            return cached
        rec = self.excel.get_record_by_case_id(case_id)
        if rec:
            self.index.upsert_record(rec, self.excel.worksheet_name)
        return rec

    def fast_search(self, **kwargs) -> list[dict[str, Any]]:
        try:
            return masterfile_reader.search(**kwargs)
        except Exception as exc:
            self._pg_read_failed("fast_search", exc)
            return self.index.search(**kwargs)

    def get_recycle_bin(self) -> list[dict[str, Any]]:
        try:
            return masterfile_reader.get_recycle_bin()
        except Exception as exc:
            self._pg_read_failed("get_recycle_bin", exc)
            return self.index.get_recycle_bin()

    def soft_delete(self, case_ids: list[str], user: str = "System", role: str = "") -> dict[str, Any]:
        self._guard_write(user, role, "delete")
        backup_file = None
        deleted: list[str] = []
        errors: list[str] = []
        try:
            backup = self.backup.create_backup()
            backup_file = backup.name if backup else None
            session = self.excel.batch_session()
            try:
                for case_id in case_ids:
                    try:
                        rec = session.set_record_status(case_id, DELETED_STATUS)
                        self.index.set_status(case_id, DELETED_STATUS)
                        deleted.append(case_id)
                        self.logger.log(
                            "masterfile", rec.get("dn_number", case_id),
                            "Soft Delete", f"Case {case_id} Deleted",
                            user=user, details=f"Status set to {DELETED_STATUS}",
                        )
                    except ExcelServiceError as exc:
                        errors.append(f"{case_id}: {exc}")
                session.save()
            finally:
                session.close()
        finally:
            self._release(user)
        return {"deleted": deleted, "errors": errors, "backup_file": backup_file}

    def restore(self, case_ids: list[str], user: str = "System", role: str = "") -> dict[str, Any]:
        self._guard_write(user, role, "edit")
        restored: list[str] = []
        errors: list[str] = []
        try:
            self.backup.create_backup()
            session = self.excel.batch_session()
            try:
                for case_id in case_ids:
                    try:
                        rec = session.set_record_status(case_id, "Active")
                        self.index.set_status(case_id, "Active")
                        restored.append(case_id)
                        self.logger.log(
                            "masterfile", rec.get("dn_number", case_id),
                            "Restore", f"Case {case_id} Restored", user=user,
                        )
                    except ExcelServiceError as exc:
                        errors.append(f"{case_id}: {exc}")
                session.save()
            finally:
                session.close()
        finally:
            self._release(user)
        return {"restored": restored, "errors": errors}

    def permanent_delete(self, case_ids: list[str], user: str = "System", role: str = "") -> dict[str, Any]:
        self._guard_write(user, role, "delete")
        removed: list[str] = []
        errors: list[str] = []
        try:
            self.backup.create_backup()
            session = self.excel.batch_session()
            try:
                for case_id in case_ids:
                    try:
                        session.permanent_delete_row(case_id)
                        self.index.remove_record(case_id)
                        removed.append(case_id)
                        self.logger.log(
                            "masterfile", case_id,
                            "Permanent Delete", f"Case {case_id} Removed",
                            user=user, details="Row permanently removed",
                        )
                    except ExcelServiceError as exc:
                        errors.append(f"{case_id}: {exc}")
                session.save()
                self.excel.sync_index_from_excel()
            finally:
                session.close()
        finally:
            self._release(user)
        return {"removed": removed, "errors": errors}

    def update_record(
        self, case_id: str, fields: dict[str, Any], user: str = "System", role: str = ""
    ) -> dict[str, Any]:
        self._guard_write(user, role, "edit")
        try:
            self.backup.create_backup()
            rec = self.excel.update_record_by_case_id(case_id, fields)
            self.index.upsert_record(rec, self.excel.worksheet_name)
            self.logger.log(
                "masterfile", str(rec.get("dn_number", case_id)),
                "Edit", f"Case {case_id} Updated", user=user,
                details=",".join(fields.keys()),
            )
            return rec
        finally:
            self._release(user)

    def rebuild_index(self) -> dict[str, int]:
        count = self.excel.sync_index_from_excel()
        stats = self.index.stats()
        return {"synced": count, **stats}

    def reset_masterfile(self, user: str = "System", role: str = "") -> dict[str, Any]:
        self._guard_write(user, role, "delete")
        try:
            backup = self.backup.create_backup()
            removed = self.excel.reset_all_data_rows()
            self.logger.log(
                "masterfile", "N/A", "Reset", f"Removed {removed} row(s)",
                user=user, details="Masterfile cleared for fresh Case_ID 1",
            )
            return {
                "removed_rows": removed,
                "backup_file": backup.name if backup else None,
            }
        finally:
            self._release(user)
