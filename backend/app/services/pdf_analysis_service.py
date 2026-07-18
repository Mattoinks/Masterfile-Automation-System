"""PDF extraction analysis, diagnostics, and learning engine."""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from app.services.autofill_service import AutofillService
from app.services.historical_analyzer import HistoricalAnalyzer, HistoricalRow
from app.services.pdf_extractor import PDFExtractionError, extract_dn_data, extract_pages_text
from config.settings import (
    ANALYZE_DIR,
    EXTRACTION_LABELS_PATH,
    EXTRACTION_LEARNING_PATH,
    EXTRACTION_LOGS_DIR,
)


FAILURE_NOT_IN_PDF = "not_in_pdf"
FAILURE_PARSER_FAILED = "parser_failed"
FAILURE_DIFFERENT_LABEL = "different_label"
FAILURE_OTHER_PAGE = "other_page"
FAILURE_HISTORICAL = "historical_match"
FAILURE_MANUAL = "manual_required"
FAILURE_DERIVED = "derived"


@dataclass
class LabelScanResult:
    label: str
    page: int
    line_number: int
    line_text: str
    value_after_label: str = ""


@dataclass
class HistoricalSuggestion:
    value: str
    confidence: float
    case_id: str = ""
    dn_number: str = ""
    match_reason: str = ""


@dataclass
class FieldDiagnostic:
    field: str
    value: str = ""
    status: str = "missing"  # found | missing | suggested
    confidence: float = 0.0
    source: str = ""
    reason: str = ""
    failure_category: str = ""
    attempted_labels: list[str] = field(default_factory=list)
    labels_found: list[dict[str, Any]] = field(default_factory=list)
    found_on_page: int | None = None
    historical_match: HistoricalSuggestion | None = None
    suggested_value: str = ""
    suggestion_source: str = ""
    alternative_method: str = ""


@dataclass
class PdfAnalysisResult:
    filename: str
    dn_number: str
    page_count: int
    extraction_method: str
    pdf_extracted: dict[str, Any]
    enriched: dict[str, Any]
    field_sources: dict[str, str]
    fields: list[FieldDiagnostic]
    log_path: str = ""
    errors: list[str] = field(default_factory=list)


@dataclass
class ComparisonInsight:
    common_labels: dict[str, list[str]]
    layout_variants: list[str]
    missing_sections: list[str]
    per_dn_summary: dict[str, dict[str, int]]


class PdfAnalysisService:
    """Analyzes DN PDFs for extraction failures and improvement opportunities."""

    def __init__(
        self,
        autofill: AutofillService | None = None,
        analyze_dir: Path | None = None,
    ) -> None:
        self.autofill = autofill or AutofillService()
        self.analyze_dir = analyze_dir or ANALYZE_DIR
        self.labels_config = self._load_labels_config()
        self.investigation_fields: list[str] = self.labels_config.get(
            "investigation_fields",
            ["owner", "package", "gf", "case_title", "rework_flow_procedure",
             "date_code", "dc_bau", "test_bau"],
        )
        self.synonyms: dict[str, list[str]] = self.labels_config.get("field_synonyms", {})
        self._last_comparison: ComparisonInsight | None = None
        self._last_results: list[PdfAnalysisResult] = []

    @staticmethod
    def _load_labels_config() -> dict[str, Any]:
        with open(EXTRACTION_LABELS_PATH, encoding="utf-8") as f:
            return json.load(f)

    def list_sample_pdfs(self) -> list[str]:
        if not self.analyze_dir.exists():
            return []
        return sorted(p.name for p in self.analyze_dir.glob("*.pdf"))

    def analyze_directory(self, directory: Path | None = None) -> dict[str, Any]:
        target = directory or self.analyze_dir
        pdfs = sorted(target.glob("*.pdf"))
        results = [self.analyze_pdf(path) for path in pdfs]
        self._last_results = results
        comparison = self._compare_results(results)
        self._last_comparison = comparison
        self._update_learning_from_results(results)
        return {
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "directory": str(target),
            "total_pdfs": len(results),
            "reports": [self._serialize_result(r) for r in results],
            "comparison": self._serialize_comparison(comparison),
            "summary": self._build_summary(results),
        }

    def analyze_pdf(self, pdf_path: Path) -> PdfAnalysisResult:
        pdf_path = Path(pdf_path)
        errors: list[str] = []
        page_texts: list[str] = []
        extraction_method = "unknown"
        pdf_data: dict[str, Any] = {}
        enriched: dict[str, Any] = {}
        field_sources: dict[str, str] = {}

        try:
            page_texts = extract_pages_text(pdf_path)
            extraction_method = "pymupdf" if any(t.strip() for t in page_texts) else "ocr_or_plumber"
            pdf_data = extract_dn_data(pdf_path)
            self.autofill.historical.refresh_if_stale()
            enriched = self.autofill.enrich(pdf_data)
            field_sources = enriched.get("field_sources", {})
        except PDFExtractionError as exc:
            errors.append(str(exc))

        dn_number = str(
            enriched.get("dn_number") or pdf_data.get("dn_number") or self._dn_from_filename(pdf_path)
        )
        full_text = "\n".join(page_texts)

        diagnostics: list[FieldDiagnostic] = []
        for fld in self.investigation_fields:
            diag = self._diagnose_field(
                fld, page_texts, full_text, pdf_data, enriched, field_sources
            )
            diagnostics.append(diag)

        for fld in ("dn_number", "quantity", "dn_date", "device"):
            if fld not in self.investigation_fields:
                diagnostics.insert(0, self._diagnose_simple_field(
                    fld, pdf_data, enriched, field_sources
                ))

        log_path = self._write_log(dn_number, pdf_path.name, diagnostics, page_texts, errors)
        return PdfAnalysisResult(
            filename=pdf_path.name,
            dn_number=dn_number,
            page_count=len(page_texts),
            extraction_method=extraction_method,
            pdf_extracted=pdf_data,
            enriched=enriched,
            field_sources=field_sources,
            fields=diagnostics,
            log_path=str(log_path),
            errors=errors,
        )

    def diagnose_for_record(
        self,
        pdf_path: Path,
        pdf_data: dict[str, Any],
        enriched: dict[str, Any],
    ) -> dict[str, dict[str, Any]]:
        """Lightweight diagnostics for live processing pipeline."""
        page_texts = extract_pages_text(pdf_path)
        full_text = "\n".join(page_texts)
        field_sources = enriched.get("field_sources", {})
        out: dict[str, dict[str, Any]] = {}
        for fld in self.investigation_fields:
            diag = self._diagnose_field(
                fld, page_texts, full_text, pdf_data, enriched, field_sources
            )
            out[fld] = self._serialize_diagnostic(diag)
        return out

    def get_report_by_dn(self, dn_number: str) -> dict[str, Any] | None:
        for result in self._last_results:
            if result.dn_number == dn_number:
                return self._serialize_result(result)
        log_path = EXTRACTION_LOGS_DIR / f"{dn_number}.log"
        if log_path.exists():
            return {"dn_number": dn_number, "log": log_path.read_text(encoding="utf-8")}
        return None

    def get_log_content(self, dn_number: str) -> str:
        log_path = EXTRACTION_LOGS_DIR / f"{dn_number}.log"
        if not log_path.exists():
            return ""
        return log_path.read_text(encoding="utf-8")

    def get_last_comparison(self) -> dict[str, Any] | None:
        if not self._last_comparison:
            return None
        return self._serialize_comparison(self._last_comparison)

    def _diagnose_simple_field(
        self,
        field: str,
        pdf_data: dict[str, Any],
        enriched: dict[str, Any],
        field_sources: dict[str, str],
    ) -> FieldDiagnostic:
        pdf_val = str(pdf_data.get(field, "") or "")
        final_val = str(enriched.get(field, "") or "")
        source = field_sources.get(field, "")
        if pdf_val:
            return FieldDiagnostic(
                field=field, value=final_val or pdf_val, status="found",
                confidence=95.0, source="pdf", reason="Extracted from PDF.",
            )
        if final_val and source in ("history", "lookup", "derived", "default"):
            conf = 88.0 if source == "history" else 70.0
            return FieldDiagnostic(
                field=field, value=final_val, status="suggested",
                confidence=conf, source=source,
                reason=f"Filled via {source} (not in PDF text).",
                failure_category=FAILURE_HISTORICAL if source == "history" else FAILURE_DERIVED,
            )
        return FieldDiagnostic(
            field=field, status="missing", confidence=0.0,
            reason="Not found in PDF.", failure_category=FAILURE_NOT_IN_PDF,
        )

    def _diagnose_field(
        self,
        field: str,
        page_texts: list[str],
        full_text: str,
        pdf_data: dict[str, Any],
        enriched: dict[str, Any],
        field_sources: dict[str, str],
    ) -> FieldDiagnostic:
        synonyms = self.synonyms.get(field, [field.replace("_", " ")])
        label_scans = self._scan_labels(page_texts, synonyms)
        pdf_val = self._pdf_value_for_field(field, pdf_data)
        final_val = str(enriched.get(field, "") or "")
        source = field_sources.get(field, "")

        attempted_labels = synonyms[:]
        labels_found = [
            {
                "label": s.label,
                "page": s.page,
                "line": s.line_number,
                "value_after_label": s.value_after_label,
            }
            for s in label_scans
        ]

        if pdf_val:
            page = self._value_page(pdf_val, page_texts)
            return FieldDiagnostic(
                field=field, value=pdf_val, status="found", confidence=95.0,
                source="pdf", reason="Extracted from PDF.",
                attempted_labels=attempted_labels, labels_found=labels_found,
                found_on_page=page,
            )

        hist = self._historical_suggestion(field, enriched)
        learned = self._learned_suggestion(field, enriched)

        if final_val and source == "pdf":
            return FieldDiagnostic(
                field=field, value=final_val, status="found", confidence=90.0,
                source="pdf", reason="Derived from PDF arrays or patterns.",
                attempted_labels=attempted_labels, labels_found=labels_found,
            )

        if final_val and source in ("history", "lookup"):
            return FieldDiagnostic(
                field=field, value=final_val, status="suggested",
                confidence=hist.confidence if hist else 85.0,
                source=source,
                reason="Requires historical lookup — not present as explicit PDF field.",
                failure_category=FAILURE_HISTORICAL,
                attempted_labels=attempted_labels, labels_found=labels_found,
                historical_match=hist,
                suggested_value=final_val, suggestion_source=source,
                alternative_method="historical_match",
            )

        if final_val and source == "derived":
            return FieldDiagnostic(
                field=field, value=final_val, status="suggested",
                confidence=65.0, source="derived",
                reason=self._derived_reason(field, enriched),
                failure_category=FAILURE_DERIVED,
                attempted_labels=attempted_labels, labels_found=labels_found,
                suggested_value=final_val, suggestion_source="derived",
            )

        if label_scans and not any(s.value_after_label for s in label_scans):
            return FieldDiagnostic(
                field=field, status="missing", confidence=15.0,
                source="pdf", reason="Different label detected — label found but value not captured by parser.",
                failure_category=FAILURE_DIFFERENT_LABEL,
                attempted_labels=attempted_labels, labels_found=labels_found,
                found_on_page=label_scans[0].page,
                historical_match=hist, suggested_value=hist.value if hist else learned,
                suggestion_source="history" if hist else ("learning" if learned else ""),
                alternative_method="improve_regex_for_label",
            )

        if label_scans:
            val_page = label_scans[0].page
            if val_page > 1:
                return FieldDiagnostic(
                    field=field, status="missing", confidence=25.0,
                    reason=f"Field appears on page {val_page} but parser did not extract it.",
                    failure_category=FAILURE_OTHER_PAGE,
                    attempted_labels=attempted_labels, labels_found=labels_found,
                    found_on_page=val_page,
                    historical_match=hist,
                    suggested_value=hist.value if hist else learned,
                    suggestion_source="history" if hist else ("learning" if learned else ""),
                    alternative_method="multi_page_scan",
                )

        if self._field_hint_in_text(field, full_text):
            return FieldDiagnostic(
                field=field, status="missing", confidence=20.0,
                reason="Field exists in PDF but parser failed to extract value.",
                failure_category=FAILURE_PARSER_FAILED,
                attempted_labels=attempted_labels, labels_found=labels_found,
                historical_match=hist,
                suggested_value=hist.value if hist else learned,
                suggestion_source="history" if hist else ("learning" if learned else ""),
                alternative_method="tune_parser_regex",
            )

        if hist or learned:
            suggestion = hist.value if hist else learned
            src = "history" if hist else "learning"
            return FieldDiagnostic(
                field=field, status="missing", confidence=0.0,
                reason="Not found in PDF.",
                failure_category=FAILURE_NOT_IN_PDF,
                attempted_labels=attempted_labels,
                historical_match=hist,
                suggested_value=suggestion,
                suggestion_source=src,
                alternative_method="historical_match" if hist else "learning_engine",
            )

        if source == "required" or not final_val:
            return FieldDiagnostic(
                field=field, status="missing", confidence=0.0,
                reason="Requires manual entry — not in PDF and no historical match.",
                failure_category=FAILURE_MANUAL,
                attempted_labels=attempted_labels,
                alternative_method="manual_entry",
            )

        return FieldDiagnostic(
            field=field, value=final_val, status="found",
            confidence=50.0, source=source or "default",
            reason="Populated from defaults or business rules.",
        )

    def _pdf_value_for_field(self, field: str, pdf_data: dict[str, Any]) -> str:
        direct = pdf_data.get(field)
        if direct not in (None, "", []):
            return str(direct)
        array_map = {
            "date_code": "all_date_codes",
            "dc_bau": "all_material_numbers",
            "test_bau": "all_test_bau",
        }
        arr_key = array_map.get(field)
        if arr_key and pdf_data.get(arr_key):
            return ", ".join(str(v) for v in pdf_data[arr_key])
        if field == "gf" and pdf_data.get("plant_code"):
            return str(pdf_data["plant_code"])
        return ""

    def _scan_labels(self, page_texts: list[str], synonyms: list[str]) -> list[LabelScanResult]:
        results: list[LabelScanResult] = []
        for page_idx, text in enumerate(page_texts, start=1):
            for line_no, line in enumerate(text.splitlines(), start=1):
                line_lower = line.lower()
                for synonym in synonyms:
                    pattern = re.compile(
                        rf"\b{re.escape(synonym)}\b\s*[:#]?\s*(.+)?",
                        re.IGNORECASE,
                    )
                    match = pattern.search(line)
                    if match or synonym.lower() in line_lower:
                        value = (match.group(1) or "").strip() if match else ""
                        if value and len(value) > 80:
                            value = value[:80] + "…"
                        results.append(LabelScanResult(
                            label=synonym, page=page_idx, line_number=line_no,
                            line_text=line.strip()[:120], value_after_label=value,
                        ))
        return results

    def _field_hint_in_text(self, field: str, text: str) -> bool:
        hints = {
            "date_code": r"\b(24\d{2}|25\d{2})\b",
            "dc_bau": r"\bMA\d{9}\b",
            "test_bau": r"\b\d{8}\b",
            "package": r"\b(PG-|SOIC|TQFP|BGA|QFN)",
            "gf": r"\bPL\s*\d{2}\b",
        }
        pattern = hints.get(field)
        return bool(pattern and re.search(pattern, text, re.IGNORECASE))

    def _value_page(self, value: str, page_texts: list[str]) -> int | None:
        needle = value[:20]
        for idx, text in enumerate(page_texts, start=1):
            if needle and needle in text:
                return idx
        return None

    def _derived_reason(self, field: str, enriched: dict[str, Any]) -> str:
        if field == "gf" and enriched.get("plant_code"):
            return f"Derived from plant code PL {enriched['plant_code']}."
        if field == "case_title":
            return "Generated from customer name template (no explicit case title in PDF)."
        return "Derived from other extracted fields."

    def _historical_suggestion(
        self, field: str, record: dict[str, Any]
    ) -> HistoricalSuggestion | None:
        historical = self.autofill.historical
        weights = self.autofill.rules.get("similarity_weights", {})
        best_score = 0.0
        best_row: HistoricalRow | None = None

        for row in historical.candidate_rows(record, limit=80):
            score = self.autofill._similarity_score(record, row, weights)
            if score > best_score:
                best_score = score
                best_row = row

        if not best_row:
            return None

        value = str(best_row.get(field, "") or "").strip()
        if not value:
            for row in historical.candidate_rows(record, limit=200):
                val = str(row.get(field, "") or "").strip()
                if val:
                    best_row = row
                    value = val
                    break

        if not value:
            return None

        max_score = sum(weights.values()) or 10
        confidence = min(99.0, round((best_score / max_score) * 100, 1))
        if confidence < 30:
            confidence = 30.0

        reasons = []
        if record.get("device") and best_row.get("device"):
            reasons.append("same device")
        if record.get("package") and best_row.get("package"):
            reasons.append("same package")
        if record.get("customer_name") and best_row.get("customer_name"):
            reasons.append("same customer")
        if record.get("rma_number") and best_row.get("rma_number"):
            reasons.append("same SAP/RMA")

        return HistoricalSuggestion(
            value=value,
            confidence=confidence,
            case_id=str(best_row.get("case_id", "")),
            dn_number=str(best_row.get("dn_number", "")),
            match_reason=", ".join(reasons) or "similar historical record",
        )

    def _learned_suggestion(self, field: str, record: dict[str, Any]) -> str:
        if not EXTRACTION_LEARNING_PATH.exists():
            return ""
        try:
            with open(EXTRACTION_LEARNING_PATH, encoding="utf-8") as f:
                learning = json.load(f)
        except (json.JSONDecodeError, OSError):
            return ""

        device = str(record.get("device", "")).strip()
        customer = str(record.get("customer_name", "")).strip()[:40]
        by_device = learning.get("by_device", {})
        if device and device in by_device.get(field, {}):
            return by_device[field][device]
        by_customer = learning.get("by_customer", {})
        if customer and customer in by_customer.get(field, {}):
            return by_customer[field][customer]
        return ""

    def _update_learning_from_results(self, results: list[PdfAnalysisResult]) -> None:
        """Learn device→field patterns from successful extractions in masterfile."""
        historical = self.autofill.historical
        historical.refresh_if_stale()
        learning: dict[str, Any] = {"by_device": defaultdict(dict), "by_customer": defaultdict(dict)}

        if EXTRACTION_LEARNING_PATH.exists():
            try:
                with open(EXTRACTION_LEARNING_PATH, encoding="utf-8") as f:
                    existing = json.load(f)
                for key in ("by_device", "by_customer"):
                    for fld, mapping in existing.get(key, {}).items():
                        learning[key][fld] = dict(mapping)
            except (json.JSONDecodeError, OSError):
                pass

        learn_fields = ["package", "owner", "gf", "rework_flow_procedure", "dc"]
        device_field_values: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
        customer_field_values: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))

        for row in historical.rows:
            device = str(row.get("device", "")).strip()
            customer = str(row.get("customer_name", "")).strip()[:40]
            for fld in learn_fields:
                val = str(row.get(fld, "")).strip()
                if not val:
                    continue
                if device:
                    device_field_values[fld][device][val] += 1
                if customer:
                    customer_field_values[fld][customer][val] += 1

        for fld in learn_fields:
            for device, counter in device_field_values[fld].items():
                if counter:
                    learning["by_device"][fld][device] = counter.most_common(1)[0][0]
            for customer, counter in customer_field_values[fld].items():
                if counter:
                    learning["by_customer"][fld][customer] = counter.most_common(1)[0][0]

        EXTRACTION_LEARNING_PATH.write_text(
            json.dumps(
                {"by_device": dict(learning["by_device"]), "by_customer": dict(learning["by_customer"])},
                indent=2,
            ),
            encoding="utf-8",
        )

    def _compare_results(self, results: list[PdfAnalysisResult]) -> ComparisonInsight:
        label_pages: dict[str, set[int]] = defaultdict(set)
        missing_counts: dict[str, dict[str, int]] = {}
        layout_notes: list[str] = []

        for result in results:
            dn = result.dn_number or result.filename
            missing_counts[dn] = {}
            for diag in result.fields:
                if diag.status == "missing":
                    missing_counts[dn][diag.field] = missing_counts[dn].get(diag.field, 0) + 1
                for lf in diag.labels_found:
                    label_pages[diag.field].add(lf.get("page", 1))

        common_labels = {
            fld: sorted({lf["label"] for r in results for d in r.fields if d.field == fld for lf in d.labels_found})
            for fld in self.investigation_fields
        }

        page_counts = {r.dn_number: r.page_count for r in results}
        if len(set(page_counts.values())) > 1:
            layout_notes.append(
                f"Page count varies: {', '.join(f'{dn}={pc}p' for dn, pc in page_counts.items())}"
            )

        always_missing = []
        if results:
            for fld in self.investigation_fields:
                if all(
                    any(d.field == fld and d.status == "missing" for d in r.fields)
                    for r in results
                ):
                    always_missing.append(fld)
        if always_missing:
            layout_notes.append(f"Always missing across samples: {', '.join(always_missing)}")

        return ComparisonInsight(
            common_labels=common_labels,
            layout_variants=layout_notes,
            missing_sections=always_missing,
            per_dn_summary=missing_counts,
        )

    def _build_summary(self, results: list[PdfAnalysisResult]) -> dict[str, Any]:
        total_fields = 0
        missing = 0
        low_confidence = 0
        for r in results:
            for d in r.fields:
                total_fields += 1
                if d.status == "missing":
                    missing += 1
                if 0 < d.confidence < 70:
                    low_confidence += 1
        return {
            "total_pdfs": len(results),
            "total_field_checks": total_fields,
            "missing_fields": missing,
            "low_confidence_fields": low_confidence,
            "dns_analyzed": [r.dn_number for r in results if r.dn_number],
        }

    def _write_log(
        self,
        dn_number: str,
        filename: str,
        diagnostics: list[FieldDiagnostic],
        page_texts: list[str],
        errors: list[str],
    ) -> Path:
        safe_dn = re.sub(r"[^\d]", "", dn_number) or Path(filename).stem
        log_path = EXTRACTION_LOGS_DIR / f"{safe_dn}.log"
        lines = [
            f"=== Extraction Analysis: DN {dn_number or filename} ===",
            f"Generated: {datetime.now(timezone.utc).isoformat()}",
            f"File: {filename}",
            f"Pages: {len(page_texts)}",
            "",
        ]
        if errors:
            lines.append("ERRORS:")
            lines.extend(f"  - {e}" for e in errors)
            lines.append("")

        for diag in diagnostics:
            symbol = "✓" if diag.status == "found" else "✗"
            lines.append(f"{symbol} {diag.field.replace('_', ' ').title()}")
            if diag.value:
                lines.append(f"  Value: {diag.value}")
            lines.append(f"  Status: {diag.status}")
            lines.append(f"  Confidence: {diag.confidence}%")
            if diag.source:
                lines.append(f"  Source: {diag.source}")
            lines.append(f"  Reason: {diag.reason}")
            if diag.attempted_labels:
                lines.append(f"  Attempted labels: {', '.join(diag.attempted_labels)}")
            if diag.labels_found:
                for lf in diag.labels_found[:3]:
                    val = lf.get("value_after_label") or "(empty)"
                    lines.append(
                        f"  Line {lf.get('line', '?')} (page {lf.get('page', '?')}): "
                        f"label '{lf.get('label')}' -> '{val}'"
                    )
            if diag.historical_match and diag.historical_match.value:
                hm = diag.historical_match
                lines.append(f"  Historical Match: {hm.value} (confidence {hm.confidence}%, case {hm.case_id})")
            if diag.suggested_value:
                lines.append(f"  Suggested: {diag.suggested_value} (source: {diag.suggestion_source})")
            if diag.alternative_method:
                lines.append(f"  Alternative: {diag.alternative_method}")
            lines.append("")

        log_path.write_text("\n".join(lines), encoding="utf-8")
        return log_path

    @staticmethod
    def _dn_from_filename(path: Path) -> str:
        match = re.search(r"(\d{10})", path.stem)
        return match.group(1) if match else ""

    def _serialize_diagnostic(self, d: FieldDiagnostic) -> dict[str, Any]:
        return {
            "field": d.field,
            "value": d.value,
            "status": d.status,
            "confidence": d.confidence,
            "source": d.source,
            "reason": d.reason,
            "failure_category": d.failure_category,
            "attempted_labels": d.attempted_labels,
            "labels_found": d.labels_found,
            "found_on_page": d.found_on_page,
            "historical_match": {
                "value": d.historical_match.value,
                "confidence": d.historical_match.confidence,
                "case_id": d.historical_match.case_id,
                "dn_number": d.historical_match.dn_number,
                "match_reason": d.historical_match.match_reason,
            } if d.historical_match else None,
            "suggested_value": d.suggested_value,
            "suggestion_source": d.suggestion_source,
            "alternative_method": d.alternative_method,
        }

    def _serialize_result(self, r: PdfAnalysisResult) -> dict[str, Any]:
        return {
            "filename": r.filename,
            "dn_number": r.dn_number,
            "page_count": r.page_count,
            "extraction_method": r.extraction_method,
            "field_sources": r.field_sources,
            "fields": [self._serialize_diagnostic(d) for d in r.fields],
            "log_path": r.log_path,
            "errors": r.errors,
        }

    def _serialize_comparison(self, c: ComparisonInsight) -> dict[str, Any]:
        return {
            "common_labels": c.common_labels,
            "layout_variants": c.layout_variants,
            "missing_sections": c.missing_sections,
            "per_dn_summary": c.per_dn_summary,
        }
