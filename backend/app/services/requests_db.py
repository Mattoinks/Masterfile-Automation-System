"""Postgres (Supabase) store for RMA Portal requests. Mirrors auth_db.py's shape.

fields_json is a jsonb column - psycopg hands it back as a plain dict
already (no json.loads needed, unlike the old sqlite3 TEXT column), but
writing a dict into a jsonb parameter needs the explicit Jsonb() wrapper -
psycopg doesn't auto-adapt a bare Python dict.
"""

from __future__ import annotations

import datetime
from typing import Any

from psycopg.types.json import Jsonb

from app.services import db

_TIMESTAMP_FIELDS = ("created_at", "updated_at")


def _row_to_record(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    for key in _TIMESTAMP_FIELDS:
        value = data.get(key)
        if isinstance(value, (datetime.datetime, datetime.date)):
            data[key] = value.isoformat()
    fields = data.pop("fields_json")
    return {
        **data,
        "request_code": f"RMA-{data['id']:04d}",
        "fields": fields,
    }


class RequestsDB:
    def __init__(self) -> None:
        pass

    def create_request(
        self,
        requester_user_id: int,
        requester_username: str,
        requester_display_name: str,
        fields: dict[str, str],
    ) -> dict[str, Any]:
        customer_name = fields.get("customer_name", "")
        dn_number = fields.get("dn_number", "")
        with db.bypass_connection() as conn:
            row = conn.execute(
                """insert into rma_requests
                   (status, requester_user_id, requester_username, requester_display_name,
                    customer_name, dn_number, fields_json)
                   values ('New', %s, %s, %s, %s, %s, %s)
                   returning *""",
                (
                    requester_user_id, requester_username, requester_display_name,
                    customer_name, dn_number, Jsonb(fields),
                ),
            ).fetchone()
        return _row_to_record(row)

    def get_by_id(self, request_id: int) -> dict[str, Any] | None:
        with db.bypass_connection() as conn:
            row = conn.execute(
                "select * from rma_requests where id = %s", (request_id,)
            ).fetchone()
        return _row_to_record(row) if row else None

    def list_all(self, status: str | None = None) -> list[dict[str, Any]]:
        with db.bypass_connection() as conn:
            if status:
                rows = conn.execute(
                    "select * from rma_requests where status = %s order by id desc", (status,)
                ).fetchall()
            else:
                rows = conn.execute("select * from rma_requests order by id desc").fetchall()
        return [_row_to_record(r) for r in rows]

    def list_by_user(self, requester_user_id: int) -> list[dict[str, Any]]:
        with db.bypass_connection() as conn:
            rows = conn.execute(
                "select * from rma_requests where requester_user_id = %s order by id desc",
                (requester_user_id,),
            ).fetchall()
        return [_row_to_record(r) for r in rows]

    def update_status(
        self, request_id: int, status: str, internal_notes: str | None = None
    ) -> dict[str, Any] | None:
        with db.bypass_connection() as conn:
            if internal_notes is not None:
                conn.execute(
                    """update rma_requests set status = %s, internal_notes = %s, updated_at = now()
                       where id = %s""",
                    (status, internal_notes, request_id),
                )
            else:
                conn.execute(
                    "update rma_requests set status = %s, updated_at = now() where id = %s",
                    (status, request_id),
                )
        return self.get_by_id(request_id)


_requests_db: RequestsDB | None = None


def get_requests_db() -> RequestsDB:
    global _requests_db
    if _requests_db is None:
        _requests_db = RequestsDB()
    return _requests_db
