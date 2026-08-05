import os
from pathlib import Path

# backend/config/settings.py → repo root (local monorepo) or DATA_DIR (cloud disk)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_ROOT.parent


def _resolve_base_dir() -> Path:
    override = os.environ.get("DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    # Prefer monorepo layout when storage/ exists next to backend/
    if (_REPO_ROOT / "storage").exists() or (_REPO_ROOT / "backend").exists():
        return _REPO_ROOT
    # Backend-only deploy (e.g. Render rootDir=backend): keep data beside the app
    return _BACKEND_ROOT


BASE_DIR = _resolve_base_dir()
STORAGE_DIR = BASE_DIR / "storage"
MASTERFILE_DIR = STORAGE_DIR / "masterfile"
UPLOADS_DIR = BASE_DIR / "uploads"
PROCESSED_DIR = BASE_DIR / "processed"
LOGS_DIR = BASE_DIR / "logs"
CONFIG_DIR = Path(__file__).resolve().parent
ANALYZE_DIR = BASE_DIR / "analyze"
EXTRACTION_LOGS_DIR = LOGS_DIR / "extraction"
EXTRACTION_LEARNING_PATH = LOGS_DIR / "extraction_learning.json"
EXTRACTION_LABELS_PATH = CONFIG_DIR / "extraction_labels.json"

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
OCR_RENDER_SCALE = float(os.environ.get("OCR_RENDER_SCALE", "2.5"))


def resolve_masterfile_path() -> Path:
    """Use RMA_MASTER.xlsx if present, otherwise master-template.xlsx."""
    if MASTERFILE_PATH.exists():
        return MASTERFILE_PATH
    if MASTERFILE_FALLBACK.exists():
        return MASTERFILE_FALLBACK
    return MASTERFILE_PATH

for directory in (
    MASTERFILE_DIR, UPLOADS_DIR, PROCESSED_DIR, LOGS_DIR, BACKUP_DIR, INDEX_DIR,
    ANALYZE_DIR, EXTRACTION_LOGS_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)
