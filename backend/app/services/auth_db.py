"""Postgres (Supabase) store for users and sessions.

Same public surface as before this became Postgres-backed - same class
name, same method signatures, same return shapes (see the datetime->ISO
string conversion below: auth_service.py's validate_token() does
session["expires_at"].replace("Z", "+00:00"), which only works on a
string - Postgres timestamptz columns come back from psycopg as native
datetime objects, so every returned row is normalized back to the ISO
strings SQLite used to hand back, not passed through raw).
"""

from __future__ import annotations

import datetime
from typing import Any

import bcrypt

from app.services import db

SESSION_TIMEOUT_MINUTES = 30
REMEMBER_ME_DAYS = 7
MIN_PASSWORD_LENGTH = 6

_TIMESTAMP_FIELDS = ("created_at", "last_login", "expires_at")


def _normalize(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    for key in _TIMESTAMP_FIELDS:
        value = row.get(key)
        if isinstance(value, (datetime.datetime, datetime.date)):
            row[key] = value.isoformat()
    return row


class AuthDB:
    def __init__(self) -> None:
        pass

    @staticmethod
    def hash_password(password: str) -> str:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode(), password_hash.encode())
        except (ValueError, TypeError):
            return False

    def get_user_by_username(self, username: str, active_only: bool = True) -> dict[str, Any] | None:
        with db.bypass_connection() as conn:
            if active_only:
                row = conn.execute(
                    "select * from users where username = %s and active = true", (username,)
                ).fetchone()
            else:
                row = conn.execute("select * from users where username = %s", (username,)).fetchone()
        return _normalize(row)

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with db.bypass_connection() as conn:
            row = conn.execute("select * from users where id = %s", (user_id,)).fetchone()
        return _normalize(row)

    def list_users(self) -> list[dict[str, Any]]:
        with db.bypass_connection() as conn:
            rows = conn.execute(
                """select id, username, display_name, role, active, created_at, last_login
                   from users order by username"""
            ).fetchall()
        return [_normalize(r) for r in rows]

    def create_user(
        self, username: str, password: str, display_name: str, role: str, active: bool = True
    ) -> dict[str, Any]:
        with db.bypass_connection() as conn:
            row = conn.execute(
                """insert into users (username, password_hash, display_name, role, active)
                   values (%s, %s, %s, %s, %s)
                   returning *""",
                (username, self.hash_password(password), display_name, role, active),
            ).fetchone()
        return _normalize(row)

    def list_pending_requesters(self) -> list[dict[str, Any]]:
        with db.bypass_connection() as conn:
            rows = conn.execute(
                """select id, username, display_name, role, active, created_at, last_login
                   from users where role = 'requester' and active = false order by created_at"""
            ).fetchall()
        return [_normalize(r) for r in rows]

    def delete_user(self, user_id: int) -> None:
        with db.bypass_connection() as conn:
            conn.execute("delete from users where id = %s", (user_id,))

    def update_user(self, user_id: int, **fields: Any) -> dict[str, Any] | None:
        allowed = {"display_name", "role", "active", "password_hash"}
        updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if "active" in updates:
            updates["active"] = bool(updates["active"])  # callers pass 1/0, column is boolean
        if not updates:
            return self.get_user_by_id(user_id)
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [user_id]
        with db.bypass_connection() as conn:
            conn.execute(f"update users set {set_clause} where id = %s", values)
        return self.get_user_by_id(user_id)

    def set_password(self, user_id: int, password: str) -> None:
        self.update_user(user_id, password_hash=self.hash_password(password))

    def update_last_login(self, user_id: int) -> None:
        with db.bypass_connection() as conn:
            conn.execute("update users set last_login = now() where id = %s", (user_id,))

    def create_session(self, token: str, user_id: int, expires_at: str, remember_me: bool) -> None:
        with db.bypass_connection() as conn:
            conn.execute(
                """insert into sessions (token, user_id, expires_at, remember_me)
                   values (%s, %s, %s, %s)""",
                (token, user_id, expires_at, bool(remember_me)),
            )

    def get_session(self, token: str) -> dict[str, Any] | None:
        with db.bypass_connection() as conn:
            row = conn.execute("select * from sessions where token = %s", (token,)).fetchone()
        return _normalize(row)

    def delete_session(self, token: str) -> None:
        with db.bypass_connection() as conn:
            conn.execute("delete from sessions where token = %s", (token,))

    def delete_user_sessions(self, user_id: int) -> None:
        with db.bypass_connection() as conn:
            conn.execute("delete from sessions where user_id = %s", (user_id,))

    def cleanup_expired_sessions(self) -> None:
        with db.bypass_connection() as conn:
            conn.execute("delete from sessions where expires_at < now()")


_auth_db: AuthDB | None = None


def get_auth_db() -> AuthDB:
    global _auth_db
    if _auth_db is None:
        _auth_db = AuthDB()
    return _auth_db
