"""Reconstructs the DN's per-lot packing table (Lot number / Lot quantity /
Date code) using token position, not text order.

Some DN PDFs have no native text layer at all and fall back to OCR
(RapidOCR); for a dense, borderless table, RapidOCR's own detection order
interleaves columns rather than reading row-by-row. Flat-text regex can't
recover "which quantity/date code belongs to which lot number" once that
ordering is lost, so this module clusters tokens by their on-page position
(y for rows, x for columns) instead of relying on any text stream's order.

Returns [] whenever the table can't be confidently located or no row
validates - callers should treat that as "fall back to the simpler
single-value behavior," never as a reason to guess.
"""

import re
from pathlib import Path
from typing import Any

import fitz
import pdfplumber

from app.services.ocr_service import OCRExtractionError, OCRUnavailableError, render_page_ocr_boxes
from app.services.pdf_extractor import _is_valid_lot_number, _parse_qty_number

_Y_TOLERANCE = 6.0
_DATE_CODE_RE = re.compile(r"2[4-6]\d{2}")

_TARGET_FIELDS = ("lot_number", "quantity", "date_code")


def _normalize_header(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def _classify_header_token(text: str) -> str | None:
    norm = _normalize_header(text)
    if "quant" in norm:
        return "quantity"
    if "date" in norm and "cod" in norm:
        return "date_code"
    if "lot" in norm and "numb" in norm:
        return "lot_number"
    return None


def _cluster_rows(tokens: list[tuple[float, float, str]]) -> list[list[tuple[float, str]]]:
    """tokens: (x, y, text). Groups tokens into rows by y-proximity, each
    row's tokens sorted left-to-right by x."""
    tokens_sorted = sorted(tokens, key=lambda t: t[1])
    rows: list[list[tuple[float, float, str]]] = []
    current: list[tuple[float, float, str]] = []
    current_y = None
    for x, y, text in tokens_sorted:
        if current and current_y is not None and abs(y - current_y) > _Y_TOLERANCE:
            rows.append(current)
            current = []
        current.append((x, y, text))
        current_y = sum(t[1] for t in current) / len(current)
    if current:
        rows.append(current)
    return [sorted(((x, text) for x, _, text in row), key=lambda t: t[0]) for row in rows]


def _page_tokens_native(page: "pdfplumber.page.Page") -> list[tuple[float, float, str]]:
    words = page.extract_words()
    return [(w["x0"], w["top"], w["text"]) for w in words]


def _page_tokens_ocr(
    page: fitz.Page,
    ocr_cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
    ocr_persistent_cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
) -> list[tuple[float, float, str]]:
    try:
        boxes = render_page_ocr_boxes(page, cache=ocr_cache, persistent_cache=ocr_persistent_cache)
    except (OCRUnavailableError, OCRExtractionError):
        return []
    return [(box[0][0], box[0][1], text) for box, text in boxes]


def _find_header(rows: list[list[tuple[float, str]]]) -> tuple[int, dict[str, float]] | None:
    for idx, row in enumerate(rows):
        anchors: dict[str, float] = {}
        for x, text in row:
            field = _classify_header_token(text)
            if field and field not in anchors:
                anchors[field] = x
        if all(field in anchors for field in _TARGET_FIELDS):
            return idx, anchors
    return None


def _nearest_token(row: list[tuple[float, str]], anchor_x: float) -> str:
    if not row:
        return ""
    return min(row, key=lambda t: abs(t[0] - anchor_x))[1]


def _extract_rows_from_tokens(all_rows: list[list[tuple[float, str]]]) -> list[dict[str, str]]:
    header = _find_header(all_rows)
    if header is None:
        return []
    header_idx, anchors = header

    results: list[dict[str, str]] = []
    for row in all_rows[header_idx + 1 :]:
        if not row:
            continue
        lot_number = _nearest_token(row, anchors["lot_number"]).strip().upper()
        if not _is_valid_lot_number(lot_number, ""):
            continue
        qty_raw = _nearest_token(row, anchors["quantity"]).strip()
        qty_val = _parse_qty_number(qty_raw)
        if qty_val is None or qty_val <= 0:
            continue
        date_code_raw = _nearest_token(row, anchors["date_code"]).strip()
        date_match = _DATE_CODE_RE.fullmatch(date_code_raw)
        if not date_match:
            continue
        quantity_str = str(int(qty_val)) if qty_val == int(qty_val) else str(qty_val)
        results.append({
            "lot_number": lot_number,
            "quantity": quantity_str,
            "date_code": date_code_raw,
        })
    return results


def extract_lot_table_rows(
    pdf_path: str | Path,
    ocr_cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
    ocr_persistent_cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
) -> list[dict[str, str]]:
    """Returns [{"lot_number", "quantity", "date_code"}, ...] in table order,
    or [] if the table can't be confidently located."""
    pdf_path = Path(pdf_path)
    all_rows: list[list[tuple[float, str]]] = []
    try:
        with fitz.open(pdf_path) as doc, pdfplumber.open(pdf_path) as plumber_doc:
            for index, page in enumerate(doc):
                native_text = page.get_text("text")
                if native_text.strip():
                    plumber_page = plumber_doc.pages[index]
                    tokens = _page_tokens_native(plumber_page)
                else:
                    tokens = _page_tokens_ocr(page, ocr_cache=ocr_cache, ocr_persistent_cache=ocr_persistent_cache)
                if tokens:
                    all_rows.extend(_cluster_rows(tokens))
    except Exception:
        return []

    try:
        return _extract_rows_from_tokens(all_rows)
    except Exception:
        return []
