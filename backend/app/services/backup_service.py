import shutil
from datetime import datetime, timezone
from pathlib import Path

from config.settings import BACKUP_DIR, resolve_masterfile_path


class BackupService:
    def __init__(self) -> None:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    def create_backup(self) -> Path | None:
        source = resolve_masterfile_path()
        if not source.exists():
            return None
        stamp = datetime.now(timezone.utc).strftime("%Y_%m_%d_%H%M")
        dest = BACKUP_DIR / f"RMA_{stamp}.xlsx"
        shutil.copy2(source, dest)
        return dest

    def list_backups(self) -> list[dict[str, str]]:
        backups: list[dict[str, str]] = []
        for path in sorted(BACKUP_DIR.glob("RMA_*.xlsx"), reverse=True):
            stat = path.stat()
            backups.append({
                "filename": path.name,
                "path": str(path),
                "size_bytes": str(stat.st_size),
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
            })
        return backups

    def restore_backup(self, filename: str) -> Path:
        source = BACKUP_DIR / filename
        if not source.exists() or not filename.startswith("RMA_") or not filename.endswith(".xlsx"):
            raise FileNotFoundError(f"Backup {filename} not found")
        target = resolve_masterfile_path()
        self.create_backup()
        shutil.copy2(source, target)
        return target
