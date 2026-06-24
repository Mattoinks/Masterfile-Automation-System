from __future__ import annotations

import json
import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any

from app.services.historical_analyzer import HistoricalAnalyzer, HistoricalRow
from config.settings import BUSINESS_RULES_PATH, REFERENCE_LOOKUPS_PATH

FieldSource = str  # pdf | history | lookup | derived | default | manual | required


class AutofillService:
    """Applies business rules, historical matching, and derived values to extracted PDF data."""

    def __init__(self, historical: HistoricalAnalyzer | None = None) -> None:
        self.historical = historical or HistoricalAnalyzer()
        self.rules = self._load_json(BUSINESS_RULES_PATH)
        self.lookups = self._load_json(REFERENCE_LOOKUPS_PATH)

    @staticmethod
    def _load_json(path) -> dict[str, Any]:
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def enrich(self, pdf_data: dict[str, Any]) -> dict[str, Any]:
        record: dict[str, Any] = {}
        sources: dict[str, FieldSource] = {}

        pdf_fields = [
            "dn_number", "dn_date", "customer_name", "device", "package", "quantity",
            "lot_number", "material_number", "rma_number", "plant_code",
            "all_lot_numbers", "all_date_codes", "all_material_numbers",
            "all_finished_prod_nos", "all_test_bau",
        ]
        for key in pdf_fields:
            if pdf_data.get(key) not in (None, "", []):
                record[key] = pdf_data[key]
                if not key.startswith("all_"):
                    sources[key] = "pdf"

        self._apply_derived(record, sources)
        self._apply_defaults(record, sources)
        self._apply_lookups(record, sources)

        match = self._find_best_match(record)
        if match:
            self._apply_historical(record, sources, match)

        self._apply_multi_values(record, sources)
        self._apply_case_title(record, sources, match)
        self._mark_required(record, sources)

        record["field_sources"] = sources
        record["matched_historical_dn"] = match.get("dn_number", "") if match else ""
        record["matched_historical_case_id"] = match.get("case_id", "") if match else ""
        return record

    def _apply_derived(self, record: dict[str, Any], sources: dict[str, FieldSource]) -> None:
        dn_date = record.get("dn_date", "")
        if not dn_date:
            return

        try:
            dt = datetime.strptime(dn_date, "%Y-%m-%d")
        except ValueError:
            return

        fmt = self.rules.get("date_formats", {})
        if not record.get("store_received"):
            record["store_received"] = dt.strftime(fmt.get("store_received", "%d-%b-%Y"))
            sources["store_received"] = "derived"
        if not record.get("recd_mth"):
            record["recd_mth"] = dt.strftime(fmt.get("recd_mth", "%b %y"))
            sources["recd_mth"] = "derived"
        if not record.get("recd_lw"):
            record["recd_lw"] = self._format_recd_lw(dt, fmt.get("recd_lw", "yyww"))
            sources["recd_lw"] = "derived"

        if record.get("plant_code") and not record.get("gf"):
            record["gf"] = str(record["plant_code"])
            sources["gf"] = "derived"

    @staticmethod
    def _format_recd_lw(dt: datetime, pattern: str) -> str:
        if pattern == "yyww":
            return f"{dt.strftime('%y')}{dt.isocalendar()[1]:02d}"
        return dt.strftime(pattern)

    def _apply_defaults(self, record: dict[str, Any], sources: dict[str, FieldSource]) -> None:
        for key, value in self.rules.get("defaults", {}).items():
            if not record.get(key):
                record[key] = value
                sources[key] = "default"

    def _find_best_match(self, record: dict[str, Any]) -> dict[str, Any] | None:
        weights = self.rules.get("similarity_weights", {})
        best_score = 0.0
        best_row: HistoricalRow | None = None

        for row in self.historical.candidate_rows(record):
            score = self._similarity_score(record, row, weights)
            if score > best_score:
                best_score = score
                best_row = row

        threshold = self.rules.get("case_title", {}).get("use_historical_if_similarity_above", 0.35)
        if best_row and best_score >= threshold * 10:
            return best_row.values
        return None

    def _similarity_score(
        self, record: dict[str, Any], historical: HistoricalRow, weights: dict[str, int]
    ) -> float:
        score = 0.0
        comparisons = [
            ("device", "device"),
            ("package", "package"),
            ("rma_number", "rma_number"),
            ("customer_name", "customer_name"),
            ("owner", "owner"),
        ]
        for rec_key, hist_key in comparisons:
            a = str(record.get(rec_key, "")).strip().lower()
            b = str(historical.get(hist_key, "")).strip().lower()
            if not a or not b:
                continue
            if a == b:
                score += weights.get(rec_key, 1)
            elif SequenceMatcher(None, a, b).ratio() > 0.8:
                score += weights.get(rec_key, 1) * 0.7
        return score

    def _apply_historical(
        self,
        record: dict[str, Any],
        sources: dict[str, FieldSource],
        match: dict[str, Any],
    ) -> None:
        copy_fields = [
            "owner", "gf", "package", "type_of_return", "dc", "dc_bau", "test_bau",
            "vkl_bau", "rework_flow_procedure", "cause_owner", "case_title", "data_source",
        ]
        for key in copy_fields:
            if not record.get(key) and match.get(key):
                record[key] = match[key]
                sources[key] = "history"

    def _apply_lookups(self, record: dict[str, Any], sources: dict[str, FieldSource]) -> None:
        device = str(record.get("device", "")).strip()
        package = str(record.get("package", "")).strip()
        customer = str(record.get("customer_name", "")).strip()
        rma = str(record.get("rma_number", "")).strip()

        for key, value in self.lookups.get("by_device", {}).get(device, {}).items():
            if not record.get(key):
                record[key] = value
                sources[key] = "lookup"

        if package:
            for key, value in self.lookups.get("by_package", {}).get(package, {}).items():
                if not record.get(key):
                    record[key] = value
                    sources[key] = "lookup"

        for cust_key, mapping in self.lookups.get("by_customer", {}).items():
            if cust_key.lower() in customer.lower():
                for key, value in mapping.items():
                    if not record.get(key):
                        record[key] = value
                        sources[key] = "lookup"

        for prefix, mapping in self.lookups.get("by_rma_prefix", {}).items():
            if rma.startswith(prefix):
                for key, value in mapping.items():
                    if not record.get(key):
                        record[key] = value
                        sources[key] = "lookup"

        if device:
            for dev_key, mapping in self.lookups.get("by_device", {}).items():
                if dev_key in device or device in dev_key:
                    for key, value in mapping.items():
                        record[key] = value
                        sources[key] = "lookup"

    def _apply_multi_values(self, record: dict[str, Any], sources: dict[str, FieldSource]) -> None:
        separators = self.rules.get("multi_value_separators", {})

        date_codes = record.get("all_date_codes") or []
        if date_codes and not record.get("date_code"):
            record["date_code"] = self._join_multi(date_codes, separators.get("date_code", ", "))
            sources["date_code"] = "pdf"

        lots = record.get("all_lot_numbers") or []
        if lots and not record.get("store_lot_qty"):
            record["store_lot_qty"] = self._join_multi(lots, separators.get("store_lot_qty", ", "))
            sources["store_lot_qty"] = "pdf"

        materials = record.get("all_material_numbers") or []
        if materials and not record.get("dc_bau"):
            record["dc_bau"] = self._join_multi(materials, separators.get("dc_bau", ", "))
            sources["dc_bau"] = "pdf"

        test_bau = record.get("all_test_bau") or []
        if test_bau and not record.get("test_bau"):
            record["test_bau"] = self._join_multi(test_bau, separators.get("test_bau", ", "))
            sources["test_bau"] = "pdf"

    @staticmethod
    def _join_multi(values: list[Any], separator: str) -> str:
        seen: list[str] = []
        for val in values:
            text = str(val).strip()
            if text and text not in seen:
                seen.append(text)
        return separator.join(seen)

    def _apply_case_title(
        self,
        record: dict[str, Any],
        sources: dict[str, FieldSource],
        match: dict[str, Any] | None,
    ) -> None:
        if record.get("case_title") and sources.get("case_title") in ("history", "pdf"):
            return

        if match and match.get("case_title"):
            record["case_title"] = match["case_title"]
            sources["case_title"] = "history"
            return

        template = self.rules.get("case_title", {}).get(
            "fallback_template", "{customer} / Technical returns"
        )
        customer = record.get("customer_name", "UNKNOWN")
        prefix = self._customer_prefix(customer)
        record["case_title"] = template.format(customer=prefix)
        sources["case_title"] = "derived"

    @staticmethod
    def _customer_prefix(customer: str) -> str:
        cleaned = re.sub(r"\s+", " ", customer).strip().upper()
        for token in ("PTE LTD.", "PTE LTD", "LTD.", "LIMITED", "SINGAPORE"):
            cleaned = cleaned.replace(token, "").strip()
        words = cleaned.split()
        if not words:
            return "UNKNOWN"
        return "".join(words[:3])

    def _mark_required(self, record: dict[str, Any], sources: dict[str, FieldSource]) -> None:
        for key in self.rules.get("required_manual_fields", []):
            if not record.get(key):
                sources[key] = "required"
