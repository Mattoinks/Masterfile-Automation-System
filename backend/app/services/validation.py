import re
from datetime import datetime

from app.models.schemas import ExtractedRecord, RecordStatus


def _is_valid_date(date_str: str) -> bool:
    if not date_str:
        return False
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            datetime.strptime(date_str, fmt)
            return True
        except ValueError:
            continue
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}$", date_str))


def validate_record(record: ExtractedRecord) -> ExtractedRecord:
    errors: list[str] = []

    if not record.dn_number.strip():
        errors.append("Missing DN Number")

    if record.quantity and not re.match(r"^\d+(?:\.\d+)?$", record.quantity.replace(",", "")):
        errors.append("Quantity must be numeric")

    if record.dn_date and not _is_valid_date(record.dn_date):
        errors.append("Invalid date format")

    required_fields = {
        "device": "Device",
        "quantity": "Quantity",
    }
    for field, label in required_fields.items():
        if not getattr(record, field, "").strip():
            errors.append(f"Missing {label}")

    if errors:
        record.status = RecordStatus.INVALID
    elif record.status == RecordStatus.INVALID:
        record.status = RecordStatus.NEW

    record.validation_errors = errors
    return record
