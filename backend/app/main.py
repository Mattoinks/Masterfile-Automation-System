import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth_routes import router as auth_router
from app.api.routes import router
from app.services.auth_service import get_auth_service
from app.services.excel_service import ExcelService
from app.services.record_service import RecordService

app = FastAPI(
    title="RMA Masterfile Automation System",
    description="Automates DN PDF processing into a single Excel masterfile",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(router)


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
