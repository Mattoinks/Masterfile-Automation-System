"""SQLite store for RMA Portal requests. Mirrors auth_db.py's shape."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from config.settings import REQUESTS_DB_PATH


class RequestsDB:
    def __init__(self, db_path=REQUESTS_DB_PATH) -> None:
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
                CREATE TABLE IF NOT EXISTS rma_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL DEFAULT 'New',
                    requester_user_id INTEGER NOT NULL,
                    requester_username TEXT NOT NULL,
                    requester_display_name TEXT NOT NULL,
                    customer_name TEXT NOT NULL DEFAULT '',
                    dn_number TEXT NOT NULL DEFAULT '',
                    linked_dn_number TEXT,
                    linked_case_id INTEGER,
                    fields_json TEXT NOT NULL,
                    internal_notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_requests_status ON rma_requests(status);
                CREATE INDEX IF NOT EXISTS idx_requests_requester ON rma_requests(requester_user_id);
            """)

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        fields = json.loads(data.pop("fields_json"))
        return {
            **data,
            "request_code": f"RMA-{data['id']:04d}",
            "fields": fields,
        }

    def create_request(
        self,
        requester_user_id: int,
        requester_username: str,
        requester_display_name: str,
        fields: dict[str, str],
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        customer_name = fields.get("customer_name", "")
        dn_number = fields.get("dn_number", "")
        with self._conn() as conn:
            cursor = conn.execute(
                """INSERT INTO rma_requests
                   (status, requester_user_id, requester_username, requester_display_name,
                    customer_name, dn_number, fields_json, created_at, updated_at)
                   VALUES ('New', ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    requester_user_id, requester_username, requester_display_name,
                    customer_name, dn_number, json.dumps(fields), now, now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM rma_requests WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return self._row_to_record(row)

    def get_by_id(self, request_id: int) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM rma_requests WHERE id = ?", (request_id,)).fetchone()
        return self._row_to_record(row) if row else None

    def list_all(self, status: str | None = None) -> list[dict[str, Any]]:
        with self._conn() as conn:
            if status:
                rows = conn.execute(
                    "SELECT * FROM rma_requests WHERE status = ? ORDER BY id DESC", (status,)
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM rma_requests ORDER BY id DESC").fetchall()
        return [self._row_to_record(r) for r in rows]

    def list_by_user(self, requester_user_id: int) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM rma_requests WHERE requester_user_id = ? ORDER BY id DESC",
                (requester_user_id,),
            ).fetchall()
        return [self._row_to_record(r) for r in rows]

    def update_status(
        self, request_id: int, status: str, internal_notes: str | None = None
    ) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            if internal_notes is not None:
                conn.execute(
                    "UPDATE rma_requests SET status = ?, internal_notes = ?, updated_at = ? WHERE id = ?",
                    (status, internal_notes, now, request_id),
                )
            else:
                conn.execute(
                    "UPDATE rma_requests SET status = ?, updated_at = ? WHERE id = ?",
                    (status, now, request_id),
                )
        return self.get_by_id(request_id)


_requests_db: RequestsDB | None = None


def get_requests_db() -> RequestsDB:
    global _requests_db
    if _requests_db is None:
        _requests_db = RequestsDB()
    return _requests_db
