import json
from datetime import datetime, timezone
from pathlib import Path

from config.settings import LOGS_DIR

LOCK_PATH = LOGS_DIR / "excel_lock.json"
LOCK_TIMEOUT_SECONDS = 300


class ExcelLockService:
    def __init__(self, lock_path: Path = LOCK_PATH) -> None:
        self.lock_path = lock_path
        LOGS_DIR.mkdir(parents=True, exist_ok=True)

    def _read_lock(self) -> dict | None:
        if not self.lock_path.exists():
            return None
        try:
            with open(self.lock_path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    def _write_lock(self, data: dict) -> None:
        with open(self.lock_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _is_expired(self, lock: dict) -> bool:
        since = lock.get("since", "")
        try:
            dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - dt).total_seconds()
            return age > LOCK_TIMEOUT_SECONDS
        except (ValueError, TypeError):
            return True

    def acquire(self, user: str = "System") -> bool:
        existing = self._read_lock()
        if existing and not self._is_expired(existing) and existing.get("user") != user:
            return False
        self._write_lock({
            "user": user,
            "since": datetime.now(timezone.utc).isoformat(),
        })
        return True

    def release(self, user: str | None = None) -> None:
        existing = self._read_lock()
        if not existing:
            return
        if user and existing.get("user") != user:
            return
        if self.lock_path.exists():
            self.lock_path.unlink()

    def get_status(self) -> dict:
        lock = self._read_lock()
        if not lock or self._is_expired(lock):
            if lock and self._is_expired(lock):
                self.release()
            return {"locked": False, "user": None, "since": None, "read_only": False}
        return {
            "locked": True,
            "user": lock.get("user"),
            "since": lock.get("since"),
            "read_only": True,
        }

    def is_locked_by_other(self, user: str) -> bool:
        status = self.get_status()
        return status["locked"] and status["user"] != user
