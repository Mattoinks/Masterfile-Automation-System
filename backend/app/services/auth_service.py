"""Authentication and session management."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.auth_db import (
    REMEMBER_ME_DAYS,
    SESSION_TIMEOUT_MINUTES,
    get_auth_db,
)
from app.services.permissions import ROLE_PERMISSIONS, UserRole, has_permission


class AuthError(Exception):
    pass


class AuthService:
    def __init__(self) -> None:
        self.db = get_auth_db()

    def initialize(self) -> None:
        self.db.seed_default_users()
        self.db.cleanup_expired_sessions()

    def login(
        self, username: str, password: str, remember_me: bool = False
    ) -> dict[str, Any]:
        user = self.db.get_user_by_username(username.strip())
        if not user or not user.get("active"):
            raise AuthError("Invalid username or password")
        if not self.db.verify_password(password, user["password_hash"]):
            raise AuthError("Invalid username or password")

        token = secrets.token_urlsafe(32)
        if remember_me:
            expires = datetime.now(timezone.utc) + timedelta(days=REMEMBER_ME_DAYS)
        else:
            expires = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TIMEOUT_MINUTES)

        self.db.create_session(token, user["id"], expires.isoformat(), remember_me)
        self.db.update_last_login(user["id"])

        return {
            "token": token,
            "expires_at": expires.isoformat(),
            "user": self._public_user(user),
        }

    def logout(self, token: str) -> None:
        if token:
            self.db.delete_session(token)

    def validate_token(self, token: str) -> dict[str, Any] | None:
        if not token:
            return None
        session = self.db.get_session(token)
        if not session:
            return None
        try:
            expires = datetime.fromisoformat(session["expires_at"].replace("Z", "+00:00"))
        except (ValueError, TypeError):
            self.db.delete_session(token)
            return None
        if expires < datetime.now(timezone.utc):
            self.db.delete_session(token)
            return None
        user = self.db.get_user_by_id(session["user_id"])
        if not user or not user.get("active"):
            return None
        return self._public_user(user)

    def refresh_session(self, token: str) -> str | None:
        """Extend session on activity (non-remember-me only)."""
        session = self.db.get_session(token)
        if not session or session.get("remember_me"):
            return None
        user = self.validate_token(token)
        if not user:
            return None
        expires = datetime.now(timezone.utc) + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
        self.db.delete_session(token)
        new_token = secrets.token_urlsafe(32)
        self.db.create_session(new_token, session["user_id"], expires.isoformat(), False)
        return new_token

    def list_users(self) -> list[dict[str, Any]]:
        return [self._public_user(u) for u in self.db.list_users()]

    def create_user(
        self, username: str, password: str, display_name: str, role: str
    ) -> dict[str, Any]:
        if role not in {r.value for r in UserRole}:
            raise AuthError(f"Invalid role: {role}")
        existing = self.db.get_user_by_username(username)
        if existing:
            raise AuthError("Username already exists")
        user = self.db.create_user(username, password, display_name, role)
        return self._public_user(user)

    def update_user(
        self,
        user_id: int,
        display_name: str | None = None,
        role: str | None = None,
        active: bool | None = None,
        password: str | None = None,
    ) -> dict[str, Any]:
        fields: dict[str, Any] = {}
        if display_name is not None:
            fields["display_name"] = display_name
        if role is not None:
            if role not in {r.value for r in UserRole}:
                raise AuthError(f"Invalid role: {role}")
            fields["role"] = role
        if active is not None:
            fields["active"] = 1 if active else 0
        if password:
            fields["password_hash"] = self.db.hash_password(password)
        user = self.db.update_user(user_id, **fields)
        if not user:
            raise AuthError("User not found")
        if active is False:
            self.db.delete_user_sessions(user_id)
        return self._public_user(user)

    def get_permissions(self, role: str) -> list[str]:
        try:
            user_role = UserRole(role.lower())
        except ValueError:
            user_role = UserRole.VIEWER
        return sorted(ROLE_PERMISSIONS.get(user_role, set()))

    @staticmethod
    def _public_user(user: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "role": user["role"],
            "active": bool(user.get("active", 1)),
            "created_at": user.get("created_at"),
            "last_login": user.get("last_login"),
        }


_auth_service: AuthService | None = None


def get_auth_service() -> AuthService:
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service
