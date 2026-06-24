"""SQLite index layer for fast search, duplicate detection, and soft-delete tracking."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config.settings import INDEX_DB_PATH
from app.services.status_utils import normalize_record_status

ACTIVE_STATUSES = frozenset({"Open", "Active", "open", "active", ""})
DELETED_STATUS = "Deleted"
ARCHIVED_STATUS = "Archived"


class IndexDB:
    def __init__(self, db_path: Path = INDEX_DB_PATH) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS records (
                    case_id TEXT PRIMARY KEY,
                    dn_number TEXT,
                    rma_number TEXT,
                    device TEXT,
                    package TEXT,
                    owner TEXT,
                    quantity TEXT,
                    status TEXT DEFAULT 'Open',
                    row_number INTEGER,
                    worksheet TEXT,
                    payload TEXT,
                    updated_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_dn ON records(dn_number);
                CREATE INDEX IF NOT EXISTS idx_device ON records(device);
                CREATE INDEX IF NOT EXISTS idx_owner ON records(owner);
                CREATE INDEX IF NOT EXISTS idx_status ON records(status);
                CREATE INDEX IF NOT EXISTS idx_package ON records(package);
            """)

    def clear_all(self) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM records")

    def upsert_record(self, record: dict[str, Any], worksheet: str = "FY2526") -> None:
        case_id = str(record.get("case_id", "")).strip()
        if not case_id:
            return
        status = normalize_record_status(record.get("status") or "Open")
        now = datetime.now(timezone.utc).isoformat()
        payload = json.dumps({k: v for k, v in record.items() if v is not None}, default=str)
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO records (case_id, dn_number, rma_number, device, package, owner,
                    quantity, status, row_number, worksheet, payload, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(case_id) DO UPDATE SET
                    dn_number=excluded.dn_number,
                    rma_number=excluded.rma_number,
                    device=excluded.device,
                    package=excluded.package,
                    owner=excluded.owner,
                    quantity=excluded.quantity,
                    status=excluded.status,
                    row_number=excluded.row_number,
                    worksheet=excluded.worksheet,
                    payload=excluded.payload,
                    updated_at=excluded.updated_at
                """,
                (
                    case_id,
                    str(record.get("dn_number") or ""),
                    str(record.get("rma_number") or ""),
                    str(record.get("device") or ""),
                    str(record.get("package") or ""),
                    str(record.get("owner") or ""),
                    str(record.get("quantity") or ""),
                    status,
                    int(record.get("row_number") or 0),
                    worksheet,
                    payload,
                    now,
                ),
            )

    def sync_from_records(self, records: list[dict[str, Any]], worksheet: str = "FY2526") -> int:
        self.clear_all()
        for rec in records:
            self.upsert_record(rec, worksheet)
        return len(records)

    def search(
        self,
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
            clauses.append(
                "(status IS NULL OR status = '' OR LOWER(status) NOT IN ('deleted', 'archived'))"
            )

        if query:
            clauses.append(
                "(case_id LIKE ? OR dn_number LIKE ? OR device LIKE ? OR owner LIKE ? OR package LIKE ? OR rma_number LIKE ?)"
            )
            q = f"%{query}%"
            params.extend([q, q, q, q, q, q])

        for field, val in [
            ("case_id", case_id),
            ("dn_number", dn_number),
            ("device", device),
            ("owner", owner),
            ("package", package),
            ("rma_number", sap_number),
        ]:
            if val:
                clauses.append(f"{field} LIKE ?")
                params.append(f"%{val}%")

        where = " AND ".join(clauses) if clauses else "1=1"
        sql = f"SELECT * FROM records WHERE {where} ORDER BY CAST(case_id AS INTEGER) DESC LIMIT ?"
        params.append(limit)

        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_recycle_bin(self, limit: int = 200) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM records WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
                (DELETED_STATUS, limit),
            ).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_by_case_id(self, case_id: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM records WHERE case_id = ?", (case_id,)).fetchone()
        return self._row_to_dict(row) if row else None

    def get_active_dn_numbers(self) -> set[str]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT dn_number FROM records WHERE dn_number != '' AND "
                "(status IS NULL OR status = '' OR LOWER(status) NOT IN ('deleted', 'archived'))"
            ).fetchall()
        return {str(r["dn_number"]).strip() for r in rows if r["dn_number"]}

    def get_all_active_records(self) -> list[dict[str, Any]]:
        return self.search(include_deleted=False, limit=10000)

    def set_status(self, case_id: str, status: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                "UPDATE records SET status = ?, updated_at = ? WHERE case_id = ?",
                (status, now, case_id),
            )

    def remove_record(self, case_id: str) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM records WHERE case_id = ?", (case_id,))

    def stats(self) -> dict[str, int]:
        with self._conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
            active = conn.execute(
                "SELECT COUNT(*) FROM records WHERE status IS NULL OR status = '' "
                "OR LOWER(status) NOT IN ('deleted', 'archived')"
            ).fetchone()[0]
            deleted = conn.execute("SELECT COUNT(*) FROM records WHERE status = ?", (DELETED_STATUS,)).fetchone()[0]
        return {"total": total, "active": active, "deleted": deleted}

    @staticmethod
    def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any]:
        if row is None:
            return {}
        d = dict(row)
        if d.get("payload"):
            try:
                d["fields"] = json.loads(d["payload"])
            except json.JSONDecodeError:
                d["fields"] = {}
        return d


# Module-level singleton for in-memory fast access after startup
_index: IndexDB | None = None


def get_index() -> IndexDB:
    global _index
    if _index is None:
        _index = IndexDB()
    return _index
