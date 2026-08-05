from enum import Enum

from typing import Optional, Any



from pydantic import BaseModel, Field

from app.models.lot2526_schemas import Lot2526BreakdownRecord





class RecordStatus(str, Enum):

    NEW = "New"

    DUPLICATE = "Duplicate"

    INVALID = "Invalid"

    INSERTED = "Inserted"

    SKIPPED = "Skipped"

    REPLACED = "Replaced"

    REVISION = "Revision"

    FORCE_INSERTED = "Force Inserted"





class DuplicateStatusType(str, Enum):

    NEW = "New"

    POSSIBLE = "Possible Duplicate"

    EXACT = "Exact Duplicate"





class DuplicateAction(str, Enum):

    SKIP = "skip"

    REPLACE = "replace"

    REVISION = "revision"

    EDIT_EXISTING = "edit_existing"

    FORCE_INSERT = "force_insert"





class FieldSource(str, Enum):

    PDF = "pdf"

    HISTORY = "history"

    LOOKUP = "lookup"

    DERIVED = "derived"

    DEFAULT = "default"

    MANUAL = "manual"

    REQUIRED = "required"





class ReviewStatus(str, Enum):

    DRAFT = "Draft"

    PENDING_REVIEW = "Pending Review"

    READY = "Ready to Insert"

    INSERTED = "Inserted"





class ExistingMasterRecord(BaseModel):

    case_id: str = ""

    row_number: int = 0

    dn_number: str = ""

    rma_number: str = ""

    device: str = ""

    package: str = ""

    quantity: str = ""

    owner: str = ""

    date_code: str = ""

    store_received: str = ""

    case_title: str = ""

    type_of_return: str = ""

    gf: str = ""

    dc: str = ""





class DuplicateMatchInfo(BaseModel):

    duplicate_status: DuplicateStatusType = DuplicateStatusType.NEW

    confidence_score: int = 0

    match_reasons: list[str] = Field(default_factory=list)

    existing_record: Optional[ExistingMasterRecord] = None

    matched_fields: list[str] = Field(default_factory=list)

    field_differences: dict[str, dict[str, str]] = Field(default_factory=dict)





class ExtractedRecord(BaseModel):

    filename: str

    dn_number: str = ""

    dn_date: str = ""

    customer_name: str = ""

    device: str = ""

    package: str = ""

    quantity: str = ""

    lot_number: str = ""

    material_number: str = ""

    rma_number: str = ""

    plant_code: str = ""

    store_received: str = ""

    recd_lw: str = ""

    recd_mth: str = ""

    type_of_return: str = ""

    gf: str = ""

    date_code: str = ""

    dc_bau: str = ""

    test_bau: str = ""

    vkl_bau: str = ""

    dc: str = ""

    owner: str = ""

    rework_flow_procedure: str = ""

    cause_owner: str = ""

    case_title: str = ""

    store_lot_qty: str = ""

    data_source: str = ""

    matched_historical_dn: str = ""

    matched_historical_case_id: str = ""

    field_sources: dict[str, str] = Field(default_factory=dict)

    pdf_values: dict[str, str] = Field(default_factory=dict)

    suggested_values: dict[str, str] = Field(default_factory=dict)

    field_diagnostics: dict[str, dict[str, Any]] = Field(default_factory=dict)

    review_status: ReviewStatus = ReviewStatus.PENDING_REVIEW

    status: RecordStatus = RecordStatus.NEW

    duplicate_status: DuplicateStatusType = DuplicateStatusType.NEW

    duplicate_match: Optional[DuplicateMatchInfo] = None

    validation_errors: list[str] = Field(default_factory=list)

    duplicate_action: Optional[DuplicateAction] = None

    record_id: Optional[str] = None

    parsed_dn: dict[str, Any] = Field(default_factory=dict, exclude=True)





class ProcessResponse(BaseModel):

    records: list[ExtractedRecord]

    total: int

    valid: int

    invalid: int

    duplicates: int

    exact_duplicates: int = 0

    possible_duplicates: int = 0

    lot2526_drafts: list[Lot2526BreakdownRecord] = Field(default_factory=list)





class SaveRecordRequest(BaseModel):

    record_id: str

    duplicate_action: DuplicateAction = DuplicateAction.SKIP

    overrides: dict[str, str] = Field(default_factory=dict)

    user: str = "System"





class SaveRequest(BaseModel):

    records: list[SaveRecordRequest]

    user: str = "System"

    lot2526_drafts: Optional[list[Lot2526BreakdownRecord]] = None


class RemoveRecordsRequest(BaseModel):
    record_ids: list[str] = Field(default_factory=list)





class SaveResponse(BaseModel):

    inserted: int

    skipped: int

    replaced: int

    revised: int = 0

    force_inserted: int = 0

    errors: list[str] = []

    backup_file: Optional[str] = None

    lot2526_saved_case_numbers: list[int] = Field(default_factory=list)

    lot2526_errors: list[str] = Field(default_factory=list)





class StatsResponse(BaseModel):

    total_records: int

    todays_uploads: int

    duplicates_found: int

    successful_inserts: int





class LogEntry(BaseModel):

    timestamp: str

    filename: str

    dn_number: str

    action: str

    status: str

    user: str = "System"

    details: str = ""





class AnalyticsResponse(BaseModel):

    total_cases: int

    monthly_returns: dict[str, int] = Field(default_factory=dict)

    top_devices: list[dict[str, str | int]] = Field(default_factory=list)

    duplicate_rate: float = 0.0

    common_failures: list[dict[str, str | int]] = Field(default_factory=list)

    cases_per_owner: list[dict[str, str | int]] = Field(default_factory=list)





class SearchRequest(BaseModel):

    case_id: str = ""

    dn_number: str = ""

    device: str = ""

    owner: str = ""

    package: str = ""

    sap_number: str = ""

    limit: int = 100





class PreviewSaveRequest(BaseModel):
    record_id: str
    duplicate_action: DuplicateAction = DuplicateAction.SKIP
    overrides: dict[str, str] = Field(default_factory=dict)


class LockStatusResponse(BaseModel):

    locked: bool

    user: Optional[str] = None

    since: Optional[str] = None

    read_only: bool = False


class DeleteRecordsRequest(BaseModel):
    case_ids: list[str] = Field(default_factory=list)
    user: str = "System"


class UpdateRecordRequest(BaseModel):
    fields: dict[str, str] = Field(default_factory=dict)
    user: str = "System"


class FastSearchRequest(BaseModel):
    query: str = ""
    case_id: str = ""
    dn_number: str = ""
    device: str = ""
    owner: str = ""
    package: str = ""
    sap_number: str = ""
    include_deleted: bool = False
    limit: int = 100


class AnalysisRunResponse(BaseModel):
    analyzed_at: str
    directory: str
    total_pdfs: int
    reports: list[dict[str, Any]]
    comparison: dict[str, Any]
    summary: dict[str, Any]

