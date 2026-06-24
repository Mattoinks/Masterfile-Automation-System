from __future__ import annotations

from typing import Any

from app.models.schemas import DuplicateMatchInfo, DuplicateStatusType, ExistingMasterRecord

COMPARE_FIELDS = [
    "dn_number",
    "rma_number",
    "device",
    "date_code",
    "quantity",
    "owner",
    "package",
    "store_received",
    "case_title",
]

KEY_IDENTITY_FIELDS = ["dn_number", "rma_number", "device"]


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _norm_qty(value: Any) -> str:
    raw = _norm(value).replace(",", "")
    try:
        return str(int(float(raw))) if raw else ""
    except (ValueError, TypeError):
        return raw


class DuplicateService:
    """Multi-criteria duplicate detection against masterfile records."""

    def analyze(
        self,
        new_record: dict[str, Any],
        masterfile_records: list[ExistingMasterRecord],
    ) -> DuplicateMatchInfo:
        if not masterfile_records:
            return DuplicateMatchInfo(
                duplicate_status=DuplicateStatusType.NEW,
                confidence_score=0,
                match_reasons=[],
            )

        best: DuplicateMatchInfo | None = None

        for existing in masterfile_records:
            match = self._compare_pair(new_record, existing)
            if match.confidence_score > (best.confidence_score if best else -1):
                best = match

        if not best or best.confidence_score < 50:
            return DuplicateMatchInfo(
                duplicate_status=DuplicateStatusType.NEW,
                confidence_score=0,
                match_reasons=[],
            )

        return best

    def _compare_pair(
        self,
        new_record: dict[str, Any],
        existing: ExistingMasterRecord,
    ) -> DuplicateMatchInfo:
        reasons: list[str] = []
        matched_fields: list[str] = []
        score = 0

        new_dn = _norm(new_record.get("dn_number"))
        ex_dn = _norm(existing.dn_number)
        if new_dn and ex_dn and new_dn == ex_dn:
            score += 40
            matched_fields.append("dn_number")
            reasons.append("Same DN / Invoice Number")

        new_sap = _norm(new_record.get("rma_number"))
        ex_sap = _norm(existing.rma_number)
        if new_sap and ex_sap and new_sap == ex_sap:
            score += 25
            matched_fields.append("rma_number")
            reasons.append("Same SAP Number")

        new_dev = _norm(new_record.get("device"))
        ex_dev = _norm(existing.device)
        new_dc = _norm(new_record.get("date_code"))
        ex_dc = _norm(existing.date_code)
        if new_dev and ex_dev and new_dev == ex_dev and new_dc and ex_dc and new_dc == ex_dc:
            score += 20
            matched_fields.append("device")
            matched_fields.append("date_code")
            reasons.append("Same Device and Date Code")

        if existing.case_id and new_dn and ex_dn and new_dn == ex_dn:
            score += 15
            reasons.append(f"Existing Case_ID {existing.case_id} associated with same DN")

        differences = self._field_differences(new_record, existing)

        if score >= 75 and not differences:
            status = DuplicateStatusType.EXACT
        elif score >= 50:
            status = DuplicateStatusType.POSSIBLE
        else:
            status = DuplicateStatusType.NEW

        if new_dn and ex_dn and new_dn == ex_dn:
            if differences:
                status = DuplicateStatusType.POSSIBLE
            elif score >= 60:
                status = DuplicateStatusType.EXACT

        return DuplicateMatchInfo(
            duplicate_status=status,
            confidence_score=min(score, 100),
            match_reasons=reasons,
            existing_record=existing if score >= 50 else None,
            matched_fields=matched_fields,
            field_differences=differences,
        )

    def _field_differences(
        self,
        new_record: dict[str, Any],
        existing: ExistingMasterRecord,
    ) -> dict[str, dict[str, str]]:
        diffs: dict[str, dict[str, str]] = {}
        existing_map = existing.model_dump()

        for field in COMPARE_FIELDS:
            new_val = str(new_record.get(field, "") or "").strip()
            old_val = str(existing_map.get(field, "") or "").strip()
            if field == "quantity":
                if _norm_qty(new_val) != _norm_qty(old_val) and (new_val or old_val):
                    diffs[field] = {"existing": old_val or "—", "new": new_val or "—"}
            elif new_val.lower() != old_val.lower() and (new_val or old_val):
                diffs[field] = {"existing": old_val or "—", "new": new_val or "—"}

        return diffs
