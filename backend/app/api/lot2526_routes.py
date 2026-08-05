"""2526 masterfile module (Phase 1: DN breakdown only).

Independent from app/api/routes.py's FY2526 pipeline. Only the uploaded-file
save helper is reused (pure file I/O, not FY2526 business logic); extraction,
mapping, and the Excel writer are all new and specific to the 2526 worksheet.
"""

from typing import Annotated

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile

from app.api.deps import require_perm
from app.api.routes import processing_service
from app.models.lot2526_schemas import (
    Lot2526BreakdownRecord,
    Lot2526CaseDetail,
    Lot2526CaseSummary,
    Lot2526LotCreationEntry,
    Lot2526ProcessResponse,
    Lot2526SaveRequest,
    Lot2526SaveResponse,
)
from app.services.backup_service import BackupService
from app.services.lock_service import ExcelLockService
from app.services.lot2526.excel_writer import (
    Lot2526ExcelError,
    Lot2526ExcelLockedError,
    Lot2526ExcelWriter,
)
from app.services.lot2526.extractor import map_dn_to_breakdown_rows
from app.services.pdf_extractor import PDFExtractionError, extract_dn_data
from config.settings import UPLOADS_DIR

router = APIRouter(prefix="/api/2526")

excel_writer = Lot2526ExcelWriter()
backup_service = BackupService()
lock_service = ExcelLockService()


@router.post("/upload")
async def upload_2526_pdfs(
    files: list[UploadFile] = File(...),
    _: Annotated[dict, Depends(require_perm("upload"))] = None,
):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    file_data: list[tuple[str, bytes]] = []
    for upload in files:
        if not upload.filename or not upload.filename.lower().endswith(".pdf"):
            continue
        content = await upload.read()
        if not content:
            continue
        file_data.append((upload.filename, content))

    if not file_data:
        raise HTTPException(status_code=400, detail="No valid PDF files provided")

    saved = processing_service.save_uploads(file_data)
    return {"uploaded": saved, "count": len(saved)}


@router.post("/process", response_model=Lot2526ProcessResponse)
def process_2526_pdfs(
    filenames: list[str] | None = Body(default=None),
    _: Annotated[dict, Depends(require_perm("process"))] = None,
):
    if filenames:
        pdf_paths = [UPLOADS_DIR / f for f in filenames if (UPLOADS_DIR / f).exists()]
    else:
        pdf_paths = sorted(UPLOADS_DIR.glob("*.pdf"))

    if not pdf_paths:
        raise HTTPException(status_code=400, detail="No uploaded PDFs to process")

    drafts: list[Lot2526BreakdownRecord] = []
    errors: list[str] = []
    for pdf_path in pdf_paths:
        try:
            dn_data = extract_dn_data(pdf_path)
            for fields in map_dn_to_breakdown_rows(dn_data):
                drafts.append(Lot2526BreakdownRecord(filename=pdf_path.name, **fields))
        except PDFExtractionError as exc:
            errors.append(f"{pdf_path.name}: {exc}")

    return Lot2526ProcessResponse(drafts=drafts, errors=errors)


@router.post("/save", response_model=Lot2526SaveResponse)
def save_2526_records(
    request: Lot2526SaveRequest,
    user: Annotated[dict, Depends(require_perm("insert"))] = None,
):
    if not request.records:
        raise HTTPException(status_code=400, detail="No records to save")

    username = user["username"] if user else "System"
    if lock_service.is_locked_by_other(username):
        status = lock_service.get_status()
        raise HTTPException(
            status_code=423,
            detail=f"Masterfile is being edited by {status['user']}. Try again shortly.",
        )

    saved_case_numbers: list[int] = []
    errors: list[str] = []
    try:
        backup_service.create_backup()
        saved_case_numbers = excel_writer.append_breakdown_rows(
            [record.model_dump() for record in request.records]
        )
    except Lot2526ExcelLockedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    except Lot2526ExcelError as exc:
        errors.append(str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"2526 save failed: {exc}") from exc

    return Lot2526SaveResponse(saved_case_numbers=saved_case_numbers, errors=errors)


@router.post("/reset")
def reset_2526_data(
    _: Annotated[dict, Depends(require_perm("delete"))] = None,
):
    """Clears all 2526 sheet data rows so the next save starts fresh at
    case No. 1. Mirrors the existing FY2526 masterfile reset."""
    try:
        backup = backup_service.create_backup()
        removed = excel_writer.reset_all_data_rows()
        return {
            "removed_rows": removed,
            "backup_file": backup.name if backup else None,
        }
    except Lot2526ExcelLockedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    except Lot2526ExcelError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"2526 reset failed: {exc}") from exc


@router.get("/cases", response_model=list[Lot2526CaseSummary])
def list_2526_cases(
    _: Annotated[dict, Depends(require_perm("view"))] = None,
):
    return excel_writer.list_cases()


@router.get("/cases/{case_no}", response_model=Lot2526CaseDetail)
def get_2526_case(
    case_no: int,
    _: Annotated[dict, Depends(require_perm("view"))] = None,
):
    detail = excel_writer.get_case_detail(case_no)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Case No. {case_no} not found")

    return Lot2526CaseDetail(**detail)


@router.post("/cases/{case_no}/lot-entries", response_model=Lot2526CaseDetail)
def append_2526_lot_entry(
    case_no: int,
    entry: Lot2526LotCreationEntry,
    user: Annotated[dict, Depends(require_perm("insert"))] = None,
):
    """Secondary action: inserts a brand-new row for a case that needs an
    extra lot-creation entry beyond its 1:1 original-lot mapping (e.g. a
    merged-wafer split)."""
    username = user["username"] if user else "System"
    if lock_service.is_locked_by_other(username):
        status = lock_service.get_status()
        raise HTTPException(
            status_code=423,
            detail=f"Masterfile is being edited by {status['user']}. Try again shortly.",
        )

    try:
        backup_service.create_backup()
        excel_writer.append_lot_creation_entry(case_no, entry.model_dump())
    except Lot2526ExcelLockedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    except Lot2526ExcelError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"2526 lot entry failed: {exc}") from exc

    detail = excel_writer.get_case_detail(case_no)
    if detail is None:
        raise HTTPException(status_code=500, detail="Entry saved but case could not be re-read")
    return Lot2526CaseDetail(**detail)


@router.patch("/cases/{case_no}/rows/{row_index}/lot-creation", response_model=Lot2526CaseDetail)
def update_2526_row_lot_creation(
    case_no: int,
    row_index: int,
    entry: Lot2526LotCreationEntry,
    user: Annotated[dict, Depends(require_perm("insert"))] = None,
):
    """Primary action: edits an existing row's Created Lot# and the fields
    that can only be known once the physical split has happened (Date
    Created, Date Code, Physical Lot Qty, Lot Code). Writes in place - no
    row insertion, nothing else in the sheet shifts."""
    username = user["username"] if user else "System"
    if lock_service.is_locked_by_other(username):
        status = lock_service.get_status()
        raise HTTPException(
            status_code=423,
            detail=f"Masterfile is being edited by {status['user']}. Try again shortly.",
        )

    try:
        backup_service.create_backup()
        excel_writer.update_row_lot_creation_fields(case_no, row_index, entry.model_dump())
    except Lot2526ExcelLockedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    except Lot2526ExcelError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"2526 row update failed: {exc}") from exc

    detail = excel_writer.get_case_detail(case_no)
    if detail is None:
        raise HTTPException(status_code=500, detail="Row saved but case could not be re-read")
    return Lot2526CaseDetail(**detail)
