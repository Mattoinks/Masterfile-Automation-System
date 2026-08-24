import os
from pathlib import Path

# backend/config/settings.py → repo root (local monorepo) or DATA_DIR (cloud disk)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_ROOT.parent

try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND_ROOT / ".env")
except ImportError:
    pass


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
REQUESTS_DB_PATH = INDEX_DIR / "requests.db"
OCR_CACHE_DIR = STORAGE_DIR / "ocr_cache"

# PDF processing performance (override via environment variables)
PDF_PROCESS_WORKERS = int(os.environ.get("PDF_PROCESS_WORKERS", "0")) or min(
    16, max(4, (os.cpu_count() or 4))
)
# 1.8 measured (real DN PDF, this repo's benchmark) to cut OCR time ~19% vs
# the previous 2.5 default with NO loss in extracted character count (in
# fact slightly more: 4454 vs 4447 chars on the test document) - 1.5 was
# faster still but measurably lost ~8% of extracted characters, so it's not
# used. Override via env var if a specific deployment needs to tune this.
OCR_RENDER_SCALE = float(os.environ.get("OCR_RENDER_SCALE", "1.8"))
OCR_MAX_PARALLEL_PAGES = int(os.environ.get("OCR_MAX_PARALLEL_PAGES", "4"))

# RMA Request Portal: outbound email notification (see request_notify_service.py).
# Leave SMTP_HOST unset to disable notifications without breaking submissions.
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM_ADDRESS = os.environ.get("SMTP_FROM_ADDRESS", "").strip()
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"
REQUEST_NOTIFY_RECIPIENTS = [
    r.strip() for r in os.environ.get("REQUEST_NOTIFY_RECIPIENTS", "").split(",") if r.strip()
]
# Frontend origin, used only to build the link in the notification email.
PORTAL_BASE_URL = os.environ.get("PORTAL_BASE_URL", "").strip().rstrip("/")

# --- Gemini API (AI-based PDF extraction, optional, free tier only) ---
# Leave GEMINI_API_KEY blank to use the existing regex/OCR extraction
# pipeline only - this is the feature-disable signal, same convention as
# SMTP_HOST above. Gemini is only ever attempted for scanned/image PDFs
# where native PyMuPDF text extraction found nothing usable - native-text
# PDFs always use the fast local pipeline regardless of this setting.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash").strip()
# Hard rollout gate, deliberately separate from GEMINI_API_KEY: even with a
# valid key configured, Gemini is not used for real scanned-PDF processing
# until this is explicitly set to "true". Flip it only after running
# backend/scripts/benchmark_gemini_extraction.py against real scanned DN
# PDFs from this project and confirming Gemini is worth the extra latency
# for your documents - installing google-genai and adding a key alone must
# never silently change production extraction behavior.
GEMINI_SCANNED_PDF_ENABLED = os.environ.get("GEMINI_SCANNED_PDF_ENABLED", "false").strip().lower() == "true"

# Supabase Postgres (see supabase/README.md). Two connection strings for the
# two roles supabase/migrations/0001_initial_schema.sql creates - empty
# strings here just mean the Postgres-backed services haven't been pointed
# at a project yet.
SUPABASE_DB_URL = os.environ.get("SUPABASE_DB_URL", "").strip()
SUPABASE_DB_URL_BYPASS = os.environ.get("SUPABASE_DB_URL_BYPASS", "").strip()


def resolve_masterfile_path() -> Path:
    """Use RMA_MASTER.xlsx if present, otherwise master-template.xlsx."""
    if MASTERFILE_PATH.exists():
        return MASTERFILE_PATH
    if MASTERFILE_FALLBACK.exists():
        return MASTERFILE_FALLBACK
    return MASTERFILE_PATH

for directory in (
    MASTERFILE_DIR, UPLOADS_DIR, PROCESSED_DIR, LOGS_DIR, BACKUP_DIR, INDEX_DIR,
    ANALYZE_DIR, EXTRACTION_LOGS_DIR, OCR_CACHE_DIR,
):
    directory.mkdir(parents=True, exist_ok=True)
