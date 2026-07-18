"""Merge multi-PDF and multi-value extraction results into one record per DN."""

from __future__ import annotations

import re
from typing import Any

MULTI_VALUE_KEYS = (
    "all_lot_numbers",
    "all_devices",
    "all_date_codes",
    "all_material_numbers",
    "all_finished_prod_nos",
    "all_test_bau",
)

INVALID_DEVICES = frozenset({
    "PACKING", "RETURN", "SINGAPORE", "MALAYSIA", "ORIGINAL", "REEL",
    "CONDITION", "KOREA", "DRY", "TECHNOLOGIES",
})

DEVICE_PRIORITY_PATTERN = re.compile(
    r"^(?:SAK|AI|IFX|TLE|TLF|BSC|IPD|IRF|MIM)-?",
    re.IGNORECASE,
)


def _unique_ordered(values: list[Any]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for val in values:
        text = str(val).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _parse_int(value: Any) -> int:
    if value is None:
        return 0
    text = str(value).replace(",", "").strip()
    try:
        return int(float(text))
    except ValueError:
        return 0


def _is_valid_device(name: str) -> bool:
    upper = name.upper().strip()
    if len(upper) < 4 or upper in INVALID_DEVICES:
        return False
    if upper.isalpha() and len(upper) > 12:
        return False
    return True


def _device_score(name: str) -> int:
    if not _is_valid_device(name):
        return -1
    upper = name.upper()
    if upper.startswith("SAK-"):
        return 100
    if re.match(r"TLE\d", upper):
        return 95
    if re.match(r"TLF\d", upper):
        return 90
    if DEVICE_PRIORITY_PATTERN.match(upper):
        return 80
    if re.match(r"M\d{3,5}[A-Z]?", upper):
        return 70
    if re.match(r"S\d{3,5}U", upper):
        return 60
    return 20


def _pick_device(candidates: list[str]) -> str:
    cleaned = _unique_ordered(candidates)
    if not cleaned:
        return ""
    scored = sorted((( _device_score(d), d) for d in cleaned), reverse=True)
    if scored[0][0] < 0:
        return ""
    return scored[0][1]


def _pick_quantity(candidates: list[str], extractions: list[dict[str, Any]] | None = None) -> str:
    if extractions:
        for ext in extractions:
            if ext.get("document_type") == "dispatch_note":
                qty = str(ext.get("quantity") or "")
                if _parse_int(qty) > 0:
                    return qty
    nums = [_parse_int(c) for c in candidates if _parse_int(c) > 0]
    if not nums:
        return ""
    return str(max(nums))


def _pick_scalar(field: str, candidates: list[str], extractions: list[dict[str, Any]] | None = None) -> str:
    values = _unique_ordered(candidates)
    if not values:
        return ""
    if field == "device":
        return _pick_device(values)
    if field == "quantity":
        return _pick_quantity(values, extractions)
    if field == "owner":
        for val in values:
            if val.lower() not in ("special instructions", "prepared") and "\n" not in val:
                return val
        return values[0].split("\n")[0].strip()
    return values[0]


def consolidate_pdf_extractions(extractions: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Stage 2 consolidation: merge raw extraction dicts from one or more PDFs
    belonging to the same DN into a single payload.
    """
    if not extractions:
        return {}
    if len(extractions) == 1:
        return dict(extractions[0])

    merged: dict[str, Any] = {}
    scalar_fields = [
        "dn_number", "dn_date", "customer_name", "device", "package", "quantity",
        "lot_number", "material_number", "rma_number", "plant_code", "carton_count",
        "owner", "rework_flow_procedure",
    ]

    for key in MULTI_VALUE_KEYS:
        combined: list[Any] = []
        for ext in extractions:
            combined.extend(ext.get(key) or [])
        if combined:
            merged[key] = _unique_ordered(combined)

    for field in scalar_fields:
        candidates = [str(ext.get(field, "") or "") for ext in extractions]
        picked = _pick_scalar(field, candidates, extractions)
        if picked:
            merged[field] = picked

    for ext in extractions:
        for key, val in ext.items():
            if key in merged or key in MULTI_VALUE_KEYS or key in scalar_fields:
                continue
            if val not in (None, "", []):
                merged[key] = val

    all_devices = list(merged.get("all_devices") or [])
    for ext in extractions:
        if ext.get("device"):
            all_devices.append(str(ext["device"]))
    merged["all_devices"] = _unique_ordered(all_devices)

    if merged.get("all_devices") and not merged.get("device"):
        merged["device"] = _pick_device(merged["all_devices"])

    if not merged.get("lot_number") and merged.get("all_lot_numbers"):
        merged["lot_number"] = merged["all_lot_numbers"][0]

    if not merged.get("material_number") and merged.get("all_material_numbers"):
        merged["material_number"] = merged["all_material_numbers"][0]

    return merged


def merge_field_sources(
    sources_list: list[dict[str, str]],
) -> dict[str, str]:
    """Prefer pdf > history > lookup > derived > default when merging sources."""
    priority = {"pdf": 0, "history": 1, "lookup": 2, "derived": 3, "default": 4, "manual": 5, "required": 6}
    merged: dict[str, str] = {}
    for sources in sources_list:
        for key, src in sources.items():
            if key not in merged or priority.get(src, 99) < priority.get(merged[key], 99):
                merged[key] = src
    return merged


def merge_pdf_values(values_list: list[dict[str, str]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for values in values_list:
        for key, val in values.items():
            if val and key not in out:
                out[key] = val
            elif val and key in out and val not in out[key]:
                out[key] = f"{out[key]}, {val}"
    return out
