import json
from datetime import datetime, timezone
from pathlib import Path

from config.settings import AUDIT_LOG_PATH, DUPLICATE_HISTORY_PATH, LOGS_DIR


class AuditLogger:
    def __init__(self, log_path: Path = AUDIT_LOG_PATH) -> None:
        self.log_path = log_path
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        self._stats_cache_path = LOGS_DIR / "stats_cache.json"
        self._ensure_stats_cache()

    def _ensure_stats_cache(self) -> None:
        if not self._stats_cache_path.exists():
            self._save_stats({"todays_uploads": 0, "duplicates_found": 0, "successful_inserts": 0, "date": ""})

    def _load_stats(self) -> dict:
        with open(self._stats_cache_path, encoding="utf-8") as f:
            return json.load(f)

    def _save_stats(self, stats: dict) -> None:
        with open(self._stats_cache_path, "w", encoding="utf-8") as f:
            json.dump(stats, f, indent=2)

    def _reset_daily_if_needed(self, stats: dict) -> dict:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if stats.get("date") != today:
            stats = {"todays_uploads": 0, "duplicates_found": 0, "successful_inserts": 0, "date": today}
            self._save_stats(stats)
        return stats

    def log(
        self,
        filename: str,
        dn_number: str,
        action: str,
        status: str,
        user: str = "System",
        details: str = "",
    ) -> None:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        safe_details = details.replace("|", "/")
        entry = f"{timestamp}|{filename}|{dn_number}|{action}|{status}|{user}|{safe_details}\n"
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(entry)

    def log_duplicate_resolution(
        self,
        case_id: str,
        dn_number: str,
        action: str,
        user: str,
        field_changes: dict[str, dict[str, str]],
    ) -> None:
        history: list[dict] = []
        if DUPLICATE_HISTORY_PATH.exists():
            try:
                with open(DUPLICATE_HISTORY_PATH, encoding="utf-8") as f:
                    history = json.load(f)
            except (json.JSONDecodeError, OSError):
                history = []

        history.append({
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "case_id": case_id,
            "dn_number": dn_number,
            "action": action,
            "user": user,
            "field_changes": field_changes,
        })
        with open(DUPLICATE_HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(history[-500:], f, indent=2)

    def _load_duplicate_history(self) -> list[dict]:
        if not DUPLICATE_HISTORY_PATH.exists():
            return []
        try:
            with open(DUPLICATE_HISTORY_PATH, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return []

    def _save_duplicate_history(self, history: list[dict]) -> None:
        with open(DUPLICATE_HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)

    def get_duplicate_history(self, limit: int = 50) -> list[dict]:
        history = self._load_duplicate_history()
        # id is this entry's position in the on-disk (chronological) list -
        # stable across calls since entries are only ever appended, and used
        # by delete_duplicate_entry() to target the exact same entry back.
        indexed = [{"id": i, **entry} for i, entry in enumerate(history)]
        return list(reversed(indexed[-limit:]))

    def clear_duplicate_history(self) -> int:
        removed = len(self._load_duplicate_history())
        self._save_duplicate_history([])
        return removed

    def delete_duplicate_entry(self, entry_id: int) -> bool:
        history = self._load_duplicate_history()
        if entry_id < 0 or entry_id >= len(history):
            return False
        del history[entry_id]
        self._save_duplicate_history(history)
        return True

    def increment_stat(self, key: str, amount: int = 1) -> None:
        stats = self._reset_daily_if_needed(self._load_stats())
        stats[key] = stats.get(key, 0) + amount
        self._save_stats(stats)

    def get_stats(self) -> dict:
        return self._reset_daily_if_needed(self._load_stats())

    def _read_log_lines(self) -> list[str]:
        if not self.log_path.exists():
            return []
        return self.log_path.read_text(encoding="utf-8").strip().splitlines()

    def _write_log_lines(self, lines: list[str]) -> None:
        content = "\n".join(lines)
        self.log_path.write_text(f"{content}\n" if content else "", encoding="utf-8")

    @staticmethod
    def _parse_log_line(line: str) -> dict | None:
        parts = line.split("|")
        if len(parts) < 5:
            return None
        return {
            "timestamp": parts[0],
            "filename": parts[1],
            "dn_number": parts[2],
            "action": parts[3],
            "status": parts[4],
            "user": parts[5] if len(parts) > 5 else "System",
            "details": parts[6] if len(parts) > 6 else "",
        }

    def get_recent_logs(self, limit: int = 50) -> list[dict]:
        lines = self._read_log_lines()
        # id is this entry's position in the on-disk (chronological) file -
        # stable across calls since lines are only ever appended, and used
        # by delete_log_entry() to target the exact same line back.
        entries = []
        for i, line in reversed(list(enumerate(lines))[-limit:]):
            parsed = self._parse_log_line(line)
            if parsed:
                entries.append({"id": i, **parsed})
        return entries

    def clear_logs(self) -> int:
        removed = len(self._read_log_lines())
        self._write_log_lines([])
        return removed

    def delete_log_entry(self, entry_id: int) -> bool:
        lines = self._read_log_lines()
        if entry_id < 0 or entry_id >= len(lines):
            return False
        del lines[entry_id]
        self._write_log_lines(lines)
        return True
