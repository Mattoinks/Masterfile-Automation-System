from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import get_current_user, require_perm

from app.models.schemas import (
    AnalysisRunResponse,
    AnalyticsResponse,
    DeleteRecordsRequest,
    FastSearchRequest,
    LockStatusResponse,
    PreviewSaveRequest,
    ProcessResponse,
    RecordStatus,
    RemoveRecordsRequest,
    SaveRequest,
    SaveResponse,
    SearchRequest,
    StatsResponse,
    UpdateRecordRequest,
)
from app.models.lot2526_schemas import Lot2526BreakdownRecord
from app.services.analytics_service import AnalyticsService
from app.services.audit_logger import AuditLogger
from app.services.backup_service import BackupService
from app.services.excel_service import ExcelService
from app.services.lock_service import ExcelLockService
from app.services.lot2526.excel_writer import Lot2526ExcelError, Lot2526ExcelWriter
from app.services.lot2526.extractor import map_dn_to_breakdown_rows
from app.services.permissions import has_permission
from app.services.pdf_analysis_service import PdfAnalysisService
from app.services.processing_progress import get_processing_progress
from app.services.processing_service import ProcessingService
from app.services.record_service import RecordService

router = APIRouter(prefix="/api")
processing_service = ProcessingService()
record_service = RecordService()
audit_logger = AuditLogger()
excel_service = ExcelService()
backup_service = BackupService()
lock_service = ExcelLockService()
analytics_service = AnalyticsService()
pdf_analysis_service = PdfAnalysisService()
lot2526_excel_writer = Lot2526ExcelWriter()

_WRITTEN_STATUSES = {
    RecordStatus.INSERTED,
    RecordStatus.REPLACED,
    RecordStatus.REVISION,
    RecordStatus.FORCE_INSERTED,
}


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.get("/stats", response_model=StatsResponse)
def get_stats(_: Annotated[dict, Depends(get_current_user)]):
    return processing_service.get_stats()


@router.get("/index/stats")
def get_index_stats(_: Annotated[dict, Depends(get_current_user)]):
    return record_service.index.stats()


@router.post("/index/sync")
def sync_index(
    background_tasks: BackgroundTasks,
    _: Annotated[dict, Depends(require_perm("configure"))],
):
    background_tasks.add_task(record_service.rebuild_index)
    return {"message": "Index sync started in background"}


@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(_: Annotated[dict, Depends(get_current_user)]):
    try:
        return analytics_service.get_analytics()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/logs")
def get_logs(
    limit: int = 50,
    user: Annotated[dict, Depends(get_current_user)] = None,
):
    if not has_permission(user["role"], "view_logs") and not has_permission(user["role"], "view"):
        raise HTTPException(status_code=403, detail="Permission denied")
    return audit_logger.get_recent_logs(limit=limit)


@router.delete("/logs")
def clear_logs(_: Annotated[dict, Depends(require_perm("delete"))] = None):
    removed = audit_logger.clear_logs()
    return {"removed": removed}


@router.delete("/logs/{entry_id}")
def delete_log_entry(entry_id: int, _: Annotated[dict, Depends(require_perm("delete"))] = None):
    if not audit_logger.delete_log_entry(entry_id):
        raise HTTPException(status_code=404, detail=f"Log entry {entry_id} not found")
    return {"deleted": entry_id}


@router.get("/duplicate-history")
def get_duplicate_history(
    limit: int = 50,
    _: Annotated[dict, Depends(get_current_user)] = None,
):
    return audit_logger.get_duplicate_history(limit=limit)


@router.delete("/duplicate-history")
def clear_duplicate_history(_: Annotated[dict, Depends(require_perm("delete"))] = None):
    removed = audit_logger.clear_duplicate_history()
    return {"removed": removed}


@router.delete("/duplicate-history/{entry_id}")
def delete_duplicate_history_entry(entry_id: int, _: Annotated[dict, Depends(require_perm("delete"))] = None):
    if not audit_logger.delete_duplicate_entry(entry_id):
        raise HTTPException(status_code=404, detail=f"History entry {entry_id} not found")
    return {"deleted": entry_id}


@router.get("/lock-status", response_model=LockStatusResponse)
def get_lock_status(_: Annotated[dict, Depends(get_current_user)]):
    return lock_service.get_status()


@router.post("/lock/acquire")
def acquire_lock(user: Annotated[dict, Depends(get_current_user)]):
    username = user["username"]
    if lock_service.acquire(username):
        return {"acquired": True, "user": username}
    status = lock_service.get_status()
    raise HTTPException(status_code=423, detail=f"Locked by {status['user']}")


@router.post("/lock/release")
def release_lock(user: Annotated[dict, Depends(get_current_user)]):
    lock_service.release(user["username"])
    return {"released": True}


@router.post("/upload")
async def upload_pdfs(
    files: list[UploadFile] = File(...),
    user: Annotated[dict, Depends(require_perm("upload"))] = None,
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
    for name in saved:
        audit_logger.log(name, "N/A", "Upload", "Uploaded", user=user["username"])
    return {"uploaded": saved, "count": len(saved)}


@router.post("/process", response_model=ProcessResponse)
def process_pdfs(
    filenames: list[str] | None = Body(default=None),
    user: Annotated[dict, Depends(require_perm("process"))] = None,
):
    try:
        response = processing_service.process_pdfs(filenames, user=user["username"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    for record in response.records:
        if not record.record_id:
            continue
        for breakdown_fields in map_dn_to_breakdown_rows(record.parsed_dn):
            response.lot2526_drafts.append(
                Lot2526BreakdownRecord(
                    record_id=record.record_id,
                    filename=record.filename,
                    **breakdown_fields,
                )
            )
    return response


@router.get("/process/status")
def get_process_status(_: Annotated[dict, Depends(get_current_user)]):
    return get_processing_progress().snapshot()


@router.post("/process/records/remove")
def remove_review_records(
    request: RemoveRecordsRequest,
    user: Annotated[dict, Depends(require_perm("process"))],
):
    if not request.record_ids:
        raise HTTPException(status_code=400, detail="No record IDs provided")
    result = processing_service.remove_pending_records(request.record_ids)
    for record_id in result["record_ids"]:
        audit_logger.log("N/A", record_id, "Review", "Record Removed", user=user["username"])
    return result


@router.post("/save/preview")
def preview_save(
    request: PreviewSaveRequest,
    _: Annotated[dict, Depends(require_perm("process"))],
):
    return processing_service.preview_save(
        request.record_id, request.overrides, request.duplicate_action
    )


@router.post("/save", response_model=SaveResponse)
def save_to_masterfile(
    request: SaveRequest,
    user: Annotated[dict, Depends(require_perm("insert"))],
):
    if not request.records:
        raise HTTPException(status_code=400, detail="No records to save")
    try:
        response = processing_service.save_records(request.records, user=user["username"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if request.lot2526_drafts:
        written_ids = {
            req.record_id
            for req in request.records
            if (rec := processing_service.get_pending_record(req.record_id))
            and rec.status in _WRITTEN_STATUSES
        }
        survivors = [d for d in request.lot2526_drafts if d.record_id in written_ids]
        if survivors:
            try:
                backup_service.create_backup()
                case_numbers = lot2526_excel_writer.append_breakdown_rows(
                    [d.model_dump() for d in survivors]
                )
                response.lot2526_saved_case_numbers = case_numbers
            except Lot2526ExcelError as exc:
                response.lot2526_errors = [str(exc)]

    return response


# --- Record management (Steps 26, 36) ---

@router.get("/records/{case_id}")
def get_record(case_id: str, _: Annotated[dict, Depends(get_current_user)]):
    rec = record_service.get_record(case_id)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    return rec


@router.patch("/records/{case_id}")
def update_record(
    case_id: str,
    request: UpdateRecordRequest,
    user: Annotated[dict, Depends(require_perm("edit"))],
):
    try:
        return record_service.update_record(case_id, request.fields, user=user["username"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/records/delete")
def soft_delete_records(
    request: DeleteRecordsRequest,
    user: Annotated[dict, Depends(require_perm("delete"))],
):
    try:
        return record_service.soft_delete(request.case_ids, user=user["username"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/records/permanent-delete")
def permanent_delete_records(
    request: DeleteRecordsRequest,
    user: Annotated[dict, Depends(require_perm("delete"))],
):
    try:
        return record_service.permanent_delete(request.case_ids, user=user["username"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/records/restore")
def restore_records(
    request: DeleteRecordsRequest,
    user: Annotated[dict, Depends(require_perm("restore"))],
):
    try:
        return record_service.restore(request.case_ids, user=user["username"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/recycle-bin")
def get_recycle_bin(_: Annotated[dict, Depends(require_perm("delete"))]):
    return {"records": record_service.get_recycle_bin()}


@router.post("/search/fast")
def fast_search(
    request: FastSearchRequest,
    _: Annotated[dict, Depends(get_current_user)],
):
    """Real-time search via SQLite index (Step 32)."""
    results = record_service.fast_search(
        query=request.query,
        case_id=request.case_id,
        dn_number=request.dn_number,
        device=request.device,
        owner=request.owner,
        package=request.package,
        sap_number=request.sap_number,
        include_deleted=request.include_deleted,
        limit=request.limit,
    )
    return {"results": results, "total": len(results)}


@router.get("/masterfile/rows")
def get_masterfile_rows(
    search: str = "",
    limit: int = 500,
    _: Annotated[dict, Depends(get_current_user)] = None,
):
    try:
        if search.strip():
            results = record_service.fast_search(query=search, limit=limit)
            return {
                "worksheet": excel_service.worksheet_name,
                "headers": [],
                "rows": results,
                "total": len(results),
                "last_case_id": excel_service.get_last_case_id(),
                "source": "index",
            }
        return excel_service.get_worksheet_rows(search=search, limit=limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/masterfile/reset")
def reset_masterfile(
    user: Annotated[dict, Depends(require_perm("delete"))],
):
    """Clear all masterfile data rows so the next insert starts at Case_ID 1."""
    try:
        result = record_service.reset_masterfile(user=user["username"])
        processing_service.clear_uploads()
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/search")
def advanced_search(
    request: SearchRequest,
    _: Annotated[dict, Depends(get_current_user)],
):
    try:
        results = record_service.fast_search(
            case_id=request.case_id,
            dn_number=request.dn_number,
            device=request.device,
            owner=request.owner,
            package=request.package,
            sap_number=request.sap_number,
            limit=request.limit,
        )
        return {"results": results, "total": len(results)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/backups")
def list_backups(_: Annotated[dict, Depends(require_perm("restore"))]):
    return {"backups": backup_service.list_backups()}


@router.post("/backups/restore")
def restore_backup(
    filename: str,
    user: Annotated[dict, Depends(require_perm("restore"))],
):
    try:
        path = backup_service.restore_backup(filename)
        record_service.rebuild_index()
        audit_logger.log(filename, "N/A", "Restore", "Masterfile Restored", user=user["username"])
        return {"restored": True, "path": str(path)}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/config/worksheet")
def get_worksheet_config(_: Annotated[dict, Depends(get_current_user)]):
    return excel_service.get_worksheet_config()


@router.get("/config/business-rules")
def get_business_rules(_: Annotated[dict, Depends(require_perm("configure"))]):
    import json
    from config.settings import BUSINESS_RULES_PATH
    with open(BUSINESS_RULES_PATH, encoding="utf-8") as f:
        return json.load(f)


@router.get("/config/reference-lookups")
def get_reference_lookups(_: Annotated[dict, Depends(require_perm("configure"))]):
    import json
    from config.settings import REFERENCE_LOOKUPS_PATH
    with open(REFERENCE_LOOKUPS_PATH, encoding="utf-8") as f:
        return json.load(f)


@router.get("/excel-layout")
def get_excel_layout(_: Annotated[dict, Depends(get_current_user)]):
    try:
        return excel_service.get_detected_headers()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/download")
def download_masterfile(_: Annotated[dict, Depends(require_perm("download"))]):
    path = excel_service.get_masterfile_path()
    if not path.exists():
        raise HTTPException(status_code=404, detail="Masterfile not found")
    return FileResponse(
        path=path,
        filename="RMA_MASTER.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.delete("/uploads")
def clear_uploads(_: Annotated[dict, Depends(require_perm("upload"))]):
    processing_service.clear_uploads()
    return {"message": "Uploads cleared"}


@router.delete("/uploads/{filename}")
def remove_upload(
    filename: str,
    user: Annotated[dict, Depends(require_perm("upload"))],
):
    if not processing_service.remove_upload(filename):
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    audit_logger.log(filename, "N/A", "Upload", "Removed", user=user["username"])
    return {"message": "File removed", "filename": Path(filename).name}


@router.get("/analyze/samples")
def list_analyze_samples(_: Annotated[dict, Depends(require_perm("configure"))]):
    return {"pdfs": pdf_analysis_service.list_sample_pdfs(), "directory": str(pdf_analysis_service.analyze_dir)}


@router.post("/analyze/run", response_model=AnalysisRunResponse)
def run_pdf_analysis(_: Annotated[dict, Depends(require_perm("configure"))]):
    try:
        return pdf_analysis_service.analyze_directory()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/analyze/pdf")
def analyze_single_pdf(
    filename: str,
    _: Annotated[dict, Depends(require_perm("configure"))],
):
    from config.settings import ANALYZE_DIR
    path = ANALYZE_DIR / Path(filename).name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"PDF not found in analyze/: {filename}")
    try:
        result = pdf_analysis_service.analyze_pdf(path)
        return pdf_analysis_service._serialize_result(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/analyze/report/{dn_number}")
def get_analysis_report(
    dn_number: str,
    _: Annotated[dict, Depends(require_perm("configure"))],
):
    report = pdf_analysis_service.get_report_by_dn(dn_number)
    if not report:
        raise HTTPException(status_code=404, detail=f"No analysis report for DN {dn_number}")
    return report


@router.get("/analyze/logs/{dn_number}")
def get_extraction_log(
    dn_number: str,
    _: Annotated[dict, Depends(require_perm("configure"))],
):
    content = pdf_analysis_service.get_log_content(dn_number)
    if not content:
        raise HTTPException(status_code=404, detail=f"No extraction log for DN {dn_number}")
    return {"dn_number": dn_number, "log": content}


@router.get("/analyze/comparison")
def get_analysis_comparison(_: Annotated[dict, Depends(require_perm("configure"))]):
    comparison = pdf_analysis_service.get_last_comparison()
    if not comparison:
        raise HTTPException(status_code=404, detail="Run analysis first via POST /api/analyze/run")
    return comparison
