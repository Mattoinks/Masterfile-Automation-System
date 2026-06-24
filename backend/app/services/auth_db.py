"""SQLite store for users and sessions."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

import bcrypt

from config.settings import AUTH_DB_PATH

SESSION_TIMEOUT_MINUTES = 30
REMEMBER_ME_DAYS = 7
MIN_PASSWORD_LENGTH = 6


class AuthDB:
    def __init__(self, db_path=AUTH_DB_PATH) -> None:
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
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    active INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL,
                    last_login TEXT
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    expires_at TEXT NOT NULL,
                    remember_me INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                );
            """)

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

    def seed_default_users(self) -> None:
        defaults = [
            ("admin", "admin123", "Administrator", "admin"),
            ("engineer1", "engineer123", "Engineer One", "engineer"),
            ("viewer1", "viewer123", "Viewer One", "viewer"),
        ]
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            for username, password, display_name, role in defaults:
                existing = conn.execute(
                    "SELECT id FROM users WHERE username = ?", (username,)
                ).fetchone()
                if existing:
                    continue
                conn.execute(
                    """INSERT INTO users (username, password_hash, display_name, role, active, created_at)
                       VALUES (?, ?, ?, ?, 1, ?)""",
                    (username, self.hash_password(password), display_name, role, now),
                )

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ? AND active = 1", (username,)
            ).fetchone()
        return dict(row) if row else None

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def list_users(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, username, display_name, role, active, created_at, last_login FROM users ORDER BY username"
            ).fetchall()
        return [dict(r) for r in rows]

    def create_user(
        self, username: str, password: str, display_name: str, role: str
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO users (username, password_hash, display_name, role, active, created_at)
                   VALUES (?, ?, ?, ?, 1, ?)""",
                (username, self.hash_password(password), display_name, role, now),
            )
            row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row)

    def update_user(self, user_id: int, **fields: Any) -> dict[str, Any] | None:
        allowed = {"display_name", "role", "active", "password_hash"}
        updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
        if not updates:
            return self.get_user_by_id(user_id)
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [user_id]
        with self._conn() as conn:
            conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        return self.get_user_by_id(user_id)

    def set_password(self, user_id: int, password: str) -> None:
        self.update_user(user_id, password_hash=self.hash_password(password))

    def update_last_login(self, user_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_id))

    def create_session(self, token: str, user_id: int, expires_at: str, remember_me: bool) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO sessions (token, user_id, expires_at, remember_me, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (token, user_id, expires_at, int(remember_me), now),
            )

    def get_session(self, token: str) -> dict[str, Any] | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM sessions WHERE token = ?", (token,)).fetchone()
        return dict(row) if row else None

    def delete_session(self, token: str) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))

    def delete_user_sessions(self, user_id: int) -> None:
        with self._conn() as conn:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

    def cleanup_expired_sessions(self) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))


_auth_db: AuthDB | None = None


def get_auth_db() -> AuthDB:
    global _auth_db
    if _auth_db is None:
        _auth_db = AuthDB()
    return _auth_db
