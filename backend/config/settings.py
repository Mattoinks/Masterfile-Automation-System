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

def _container_cpu_quota() -> int | None:
    """Reads the actual cgroup CPU quota (cores) when running in a
    container. os.cpu_count() reports the HOST's total logical CPUs, not
    what a Kubernetes/OpenShift pod's resource limit actually entitles it
    to - on a node with e.g. 16 host cores but a pod capped at "3 cores",
    os.cpu_count() still returns 16, so sizing thread-pool defaults off it
    causes the app to spin up far more concurrent OCR work than the pod's
    CPU quota can actually service. That shows up as severe CPU throttling
    under load, which looks exactly like requests timing out. Cgroup v2
    (standard on modern Kubernetes/OpenShift) exposes the real quota at
    /sys/fs/cgroup/cpu.max as "<quota> <period>" in microseconds, or "max"
    if unlimited."""
    try:
        raw = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        if raw[0] == "max":
            return None
        quota, period = int(raw[0]), int(raw[1])
        return max(1, quota // period)
    except (OSError, IndexError, ValueError):
        return None


# PDF processing performance (override via environment variables).
# Both worker counts below default off the container's real CPU quota when
# detectable (see _container_cpu_quota), not the host's full core count -
# PDF_PROCESS_WORKERS (per-file parallelism) and OCR_MAX_PARALLEL_PAGES
# (per-page parallelism WITHIN each file) multiply together for worst-case
# thread count, so both need to stay small on a CPU-quota-constrained
# deployment (e.g. OpenShift) or the app oversubscribes its own quota and
# gets throttled into timeouts instead of actually finishing faster.
_cpu_quota = _container_cpu_quota() or os.cpu_count() or 4
PDF_PROCESS_WORKERS = int(os.environ.get("PDF_PROCESS_WORKERS", "0")) or min(4, max(2, _cpu_quota))
# 1.8 measured (real DN PDF, this repo's benchmark) to cut OCR time ~19% vs
# the previous 2.5 default with NO loss in extracted character count (in
# fact slightly more: 4454 vs 4447 chars on the test document) - 1.5 was
# faster still but measurably lost ~8% of extracted characters, so it's not
# used. Override via env var if a specific deployment needs to tune this.
OCR_RENDER_SCALE = float(os.environ.get("OCR_RENDER_SCALE", "1.8"))
# Nests INSIDE PDF_PROCESS_WORKERS (worst case: PDF_PROCESS_WORKERS x
# OCR_MAX_PARALLEL_PAGES concurrent OCR threads at once), so this stays
# small and quota-aware rather than a flat "4" - see the comment above
# PDF_PROCESS_WORKERS.
OCR_MAX_PARALLEL_PAGES = int(os.environ.get("OCR_MAX_PARALLEL_PAGES", "0")) or min(2, max(1, _cpu_quota))

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
