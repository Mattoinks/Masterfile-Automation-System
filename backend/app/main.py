import os
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.auth_routes import router as auth_router
from app.api.lot2526_routes import router as lot2526_router
from app.api.routes import router
from app.services.auth_service import get_auth_service
from app.services.excel_service import ExcelService
from app.services.record_service import RecordService


def _cors_origins() -> list[str]:
    defaults = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ]
    raw = os.environ.get("CORS_ORIGINS", "").strip()
    if not raw:
        return defaults
    extra = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return defaults + [o for o in extra if o not in defaults]


def _static_dir() -> Path | None:
    raw = os.environ.get("STATIC_DIR", "").strip()
    if raw:
        path = Path(raw).expanduser().resolve()
    else:
        candidates = [
            Path(__file__).resolve().parents[1] / "static",
            Path(__file__).resolve().parents[2] / "frontend" / "dist",
        ]
        path = next((p for p in candidates if (p / "index.html").exists()), None)
        if path is None:
            return None
    return path if (path / "index.html").exists() else None


app = FastAPI(
    title="RMA Masterfile Automation System",
    description="Automates DN PDF processing into a single Excel masterfile",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(router)
app.include_router(lot2526_router)


def _background_index_sync() -> None:
    try:
        excel = ExcelService()
        excel.ensure_masterfile_exists()
        RecordService().rebuild_index()
    except Exception:
        pass


@app.on_event("startup")
def startup():
    ExcelService().ensure_masterfile_exists()
    get_auth_service().initialize()
    threading.Thread(target=_background_index_sync, daemon=True).start()


_STATIC = _static_dir()
if _STATIC is not None:
    assets = _STATIC / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.api_route("/", methods=["GET", "HEAD"])
    async def spa_root():
        return FileResponse(_STATIC / "index.html")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # Never shadow API / docs (registered above); only serve UI files.
        if full_path.startswith(("api/", "docs", "openapi.json", "redoc")):
            raise HTTPException(status_code=404)
        candidate = (_STATIC / full_path).resolve()
        try:
            candidate.relative_to(_STATIC.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404) from exc
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_STATIC / "index.html")
