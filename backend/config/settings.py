import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = BASE_DIR / "storage"
MASTERFILE_DIR = STORAGE_DIR / "masterfile"
UPLOADS_DIR = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
LOGS_DIR = BASE_DIR / "logs"
CONFIG_DIR = Path(__file__).resolve().parent

MASTERFILE_NAME = "RMA_MASTER.xlsx"
MASTERFILE_PATH = MASTERFILE_DIR / MASTERFILE_NAME
MASTERFILE_FALLBACK = MASTERFILE_DIR / "master-template.xlsx"
WORKSHEET_CONFIG_PATH = CONFIG_DIR / "worksheet_config.json"
FIELD_MAPPING_PATH = CONFIG_DIR / "field_mapping.json"
BUSINESS_RULES_PATH = CONFIG_DIR / "business_rules.json"
REFERENCE_LOOKUPS_PATH = CONFIG_DIR / "reference_lookups.json"
COLUMN_MAPPING_PATH = CONFIG_DIR / "column_mapping.json"  # legacy alias
AUDIT_LOG_PATH = LOGS_DIR / "audit.log"
BACKUP_DIR = STORAGE_DIR / "backup"
DUPLICATE_HISTORY_PATH = LOGS_DIR / "duplicate_history.json"
INDEX_DIR = STORAGE_DIR / "index"
INDEX_DB_PATH = INDEX_DIR / "rma_index.db"
AUTH_DB_PATH = INDEX_DIR / "auth.db"

# PDF processing performance (override via environment variables)
PDF_PROCESS_WORKERS = int(os.environ.get("PDF_PROCESS_WORKERS", "0")) or min(
    16, max(4, (os.cpu_count() or 4))
)
OCR_RENDER_SCALE = float(os.environ.get("OCR_RENDER_SCALE", "1.5"))


def resolve_masterfile_path() -> Path:
    """Use RMA_MASTER.xlsx if present, otherwise master-template.xlsx."""
    if MASTERFILE_PATH.exists():
        return MASTERFILE_PATH
    if MASTERFILE_FALLBACK.exists():
        return MASTERFILE_FALLBACK
    return MASTERFILE_PATH

for directory in (MASTERFILE_DIR, UPLOADS_DIR, PROCESSED_DIR, LOGS_DIR, BACKUP_DIR, INDEX_DIR):
    directory.mkdir(parents=True, exist_ok=True)
