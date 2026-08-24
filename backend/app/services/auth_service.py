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
        # No demo-account auto-seeding: the initial Admin is provisioned
        # manually in Supabase during deployment/setup (see supabase/README.md),
        # Engineer accounts only ever come from Admin -> User Management, and
        # Requester accounts only from the Portal's self-registration flow.
        self.db.cleanup_expired_sessions()

    def login(
        self, username: str, password: str, remember_me: bool = False
    ) -> dict[str, Any]:
        # Looked up without the active filter first so a correct password on
        # a not-yet-approved Requester account gets a real "pending approval"
        # message instead of the generic invalid-credentials one - but only
        # once the password's already been verified, so this never reveals
        # account existence to someone who doesn't know the password.
        user = self.db.get_user_by_username(username.strip(), active_only=False)
        if not user or not self.db.verify_password(password, user["password_hash"]):
            raise AuthError("Invalid username or password")
        if not user.get("active"):
            if user.get("role") == "requester":
                raise AuthError("Your account is pending Admin approval.")
            raise AuthError("This account has been disabled. Contact an administrator.")

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
        self, username: str, password: str, display_name: str, role: str, active: bool = True
    ) -> dict[str, Any]:
        if role not in {r.value for r in UserRole}:
            raise AuthError(f"Invalid role: {role}")
        existing = self.db.get_user_by_username(username, active_only=False)
        if existing:
            raise AuthError("Username already exists")
        user = self.db.create_user(username, password, display_name, role, active=active)
        return self._public_user(user)

    def register_requester(self, username: str, password: str, display_name: str) -> dict[str, Any]:
        """Public self-registration entry point (Requester Portal only).
        Role is hardcoded here, never taken from a caller - this is the
        only account-creation path that isn't gated by manage_users, so it
        must never be able to produce anything but a requester account.
        Created inactive - an Admin must approve it (see approve_requester)
        before the account can log in."""
        return self.create_user(
            username, password, display_name, UserRole.REQUESTER.value, active=False
        )

    def list_pending_requesters(self) -> list[dict[str, Any]]:
        return [self._public_user(u) for u in self.db.list_pending_requesters()]

    def approve_requester(self, user_id: int) -> dict[str, Any]:
        user = self.db.get_user_by_id(user_id)
        if not user or user.get("role") != "requester":
            raise AuthError("Pending requester not found")
        updated = self.db.update_user(user_id, active=True)
        if not updated:
            raise AuthError("Pending requester not found")
        return self._public_user(updated)

    def reject_requester(self, user_id: int) -> None:
        """Deletes a not-yet-approved Requester registration outright -
        only ever applies to accounts that were never active, so there's
        no session/data cleanup to worry about (an already-approved
        Requester is deactivated via update_user, not deleted this way)."""
        user = self.db.get_user_by_id(user_id)
        if not user or user.get("role") != "requester" or user.get("active"):
            raise AuthError("Pending requester not found")
        self.db.delete_user(user_id)

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
            return []  # unrecognized role - no permissions, never guess a fallback role
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
