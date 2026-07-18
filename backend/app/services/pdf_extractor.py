import re
from pathlib import Path
from typing import Any, Callable

import fitz  # PyMuPDF
import pdfplumber

from app.services.extraction_consolidator import consolidate_pdf_extractions
from app.services.ocr_service import OCRExtractionError, extract_text_with_ocr

ProgressCallback = Callable[[str, str], None]


class PDFExtractionError(Exception):
    pass


def _extract_text_pdfplumber(pdf_path: Path) -> str:
    text_parts: list[str] = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                text_parts.append(page_text)
    except Exception as exc:
        raise PDFExtractionError(f"Failed to read PDF with pdfplumber: {exc}") from exc
    return "\n".join(text_parts)


def _extract_text_pymupdf(pdf_path: Path) -> str:
    text_parts: list[str] = []
    try:
        with fitz.open(pdf_path) as doc:
            for page in doc:
                text_parts.append(page.get_text("text"))
    except Exception as exc:
        raise PDFExtractionError(f"Failed to read PDF with PyMuPDF: {exc}") from exc
    return "\n".join(text_parts)


def _page_count(pdf_path: Path) -> int:
    with fitz.open(pdf_path) as doc:
        return doc.page_count


def _extract_text(pdf_path: Path, on_progress: ProgressCallback | None = None) -> str:
    """Extract full document text — every page, no early stop."""
    if on_progress:
        on_progress("reading", "Reading PDF text…")

    text = _extract_text_pymupdf(pdf_path)
    if text.strip():
        if on_progress:
            on_progress("parsing", "Parsing extracted fields…")
        return text

    try:
        with fitz.open(pdf_path) as doc:
            has_images = any(page.get_images() for page in doc)
            page_total = doc.page_count
    except Exception as exc:
        raise PDFExtractionError(f"Failed to read PDF with PyMuPDF: {exc}") from exc

    if has_images:
        try:
            def on_page(page: int, total: int) -> None:
                if on_progress:
                    on_progress("ocr", f"OCR page {page}/{total}")

            if on_progress:
                on_progress("ocr", f"Scanned PDF — OCR all {page_total} page(s)…")

            text = extract_text_with_ocr(
                pdf_path,
                max_pages=page_total,
                stop_when=None,
                on_page=on_page,
            )
            if on_progress:
                on_progress("parsing", "Parsing OCR text…")
            return text
        except OCRExtractionError as exc:
            raise PDFExtractionError(str(exc)) from exc

    text = _extract_text_pdfplumber(pdf_path)
    if text.strip():
        if on_progress:
            on_progress("parsing", "Parsing extracted fields…")
        return text

    raise PDFExtractionError("PDF contains no extractable text")


def _search_pattern(text: str, patterns: list[str], group: int = 1) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL)
        if match:
            value = match.group(group).strip()
            if value:
                return value
    return ""


def _normalize_dn_number(raw: str) -> str:
    return re.sub(r"\D", "", raw)


def _normalize_date(raw: str) -> str:
    raw = raw.strip()
    for fmt_match in [
        r"(\d{2})\.(\d{2})\.(\d{4})",
        r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})",
        r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})",
        r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})",
    ]:
        match = re.search(fmt_match, raw)
        if match:
            groups = match.groups()
            if len(groups[0]) == 4:
                year, month, day = groups
            elif groups[1].isalpha():
                day, month, year = groups[0], groups[1], groups[2]
            else:
                day, month, year = groups
            if str(month).isalpha():
                from datetime import datetime
                try:
                    dt = datetime.strptime(f"{day} {month} {year}", "%d %b %Y")
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    continue
            return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    return raw


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _format_infineon_device(raw: str) -> str:
    compact = raw.upper().replace(" ", "")
    compact = re.sub(r"ORD.*$", "", compact)
    match = re.match(r"^(SAK-[A-Z0-9]+-\d+F\d+S)([A-Z]{1,3})$", compact)
    if match:
        return f"{match.group(1)} {match.group(2)}"
    match = re.match(r"^(SAK-[A-Z0-9-]+)$", compact)
    if match:
        return match.group(1)
    return _normalize_whitespace(raw.upper())


def _format_customer_name(raw: str) -> str:
    name = raw
    name = re.sub(r"Infineon\s*Technologies", "INFINEON TECHNOLOGIES", name, flags=re.I)
    name = re.sub(r"Asia\s*Pacific", "ASIA PACIFIC", name, flags=re.I)
    name = re.sub(r"Pte\s*Ltd\.?", "PTE LTD.", name, flags=re.I)
    return _normalize_whitespace(name)


def _is_valid_lot_number(lot: str, dn_number: str) -> bool:
    lot = lot.upper()
    if lot == dn_number:
        return False
    if lot.startswith("MA") or lot.startswith("800"):
        return False
    if re.fullmatch(r"\d{4}", lot):
        return False
    if len(lot) < 10 or len(lot) > 13:
        return False
    if not re.search(r"[A-Z]", lot) or not re.search(r"\d", lot):
        return False
    if any(token in lot for token in ("F300", "SAE", "PCE", "EUR")):
        return False
    return True


def _bau_from_filename(pdf_path: Path) -> str:
    match = re.search(r"(95\d{6})", pdf_path.stem)
    return match.group(1) if match else ""


def _is_rma_form(text: str) -> bool:
    upper = text.upper()
    return "RMA FORM" in upper or (
        "DISPATCH NOTE NO" in upper and "PACKAGE TYPE" in upper
    )


def _extract_date_codes(text: str) -> list[str]:
    """Extract YYWW date codes (24xx–26xx for 2024–2026 lots)."""
    codes: list[str] = []
    for match in re.finditer(r"\b(2[4-6]\d{2})\b", text):
        code = match.group(1)
        num = int(code)
        if 2400 <= num <= 2699 and code not in codes:
            codes.append(code)

    table_match = re.search(
        r"Date\s*cod(?:e|)\b[\s\S]{0,500}?\b(2[4-6]\d{2})\b",
        text,
        re.IGNORECASE,
    )
    if table_match:
        code = table_match.group(1)
        if code not in codes:
            codes.append(code)

    datecode_label = re.search(
        r"Datecod(?:e|)\b[\s\S]{0,800}?\b(2[4-6]\d{2})\b",
        text,
        re.IGNORECASE,
    )
    if datecode_label:
        code = datecode_label.group(1)
        if code not in codes:
            codes.append(code)

    return sorted(codes, key=int)


def _extract_valid_test_bau(text: str, filename_bau: str = "") -> list[str]:
    """Collect 8-digit Bau numbers (95xxxxxx); exclude HS export codes."""
    baus: list[str] = []
    if filename_bau:
        baus.append(filename_bau)

    for match in re.finditer(
        r"Baunumber[^\d]{0,40}(\d{8})|Bar[\s-]*number[^\d]{0,40}(\d{8})",
        text,
        re.IGNORECASE,
    ):
        val = match.group(1) or match.group(2)
        if val and val.startswith("95"):
            baus.append(val)

    for match in re.finditer(r"\b(95\d{6})\b", text):
        baus.append(match.group(1))

    seen: set[str] = set()
    out: list[str] = []
    for bau in baus:
        if bau in seen:
            continue
        if bau.startswith("8542") or bau.startswith("8543"):
            continue
        seen.add(bau)
        out.append(bau)
    return out


def _extract_package_device_combo(text: str) -> tuple[str, str]:
    match = re.search(
        r"\b(PG-[A-Z0-9-]+)\s*/\s*([A-Z][A-Z0-9]{2,})\b",
        text,
        re.IGNORECASE,
    )
    if match:
        return match.group(1).upper(), match.group(2).upper()

    pkg = _search_pattern(text, [r"\b(PG-[A-Z0-9-]+)\b"])
    return pkg.upper() if pkg else "", ""


def _extract_rma_quantity(text: str) -> str:
    pcs_match = re.search(
        r"(\d{1,3}(?:,\d{3})*)\s*pcs",
        text,
        re.IGNORECASE,
    )
    if pcs_match:
        return pcs_match.group(1).replace(",", "")

    mult_match = re.search(r"(\d+)\s*x\s*(\d+)", text, re.IGNORECASE)
    if mult_match:
        return str(int(mult_match.group(1)) * int(mult_match.group(2)))
    return ""


def _clean_owner_name(raw: str) -> str:
    name = re.sub(r"\s+", " ", raw).strip()
    name = re.sub(r"\s*\([^)]*\)\s*", "", name).strip()
    if name.lower() in ("special instructions", "prepared", "n/a"):
        return ""
    return name


def _extract_attn_owner(text: str) -> str:
    """Extract contact name from DN shipping attn. lines (e.g. attn.: Leow Siok Hua)."""
    patterns = [
        r"attn\.?\s*:?\s*([A-Za-z][A-Za-z\s.'-]{2,50}?)(?:\s*\(|\n|$)",
        r"attention\s*:?\s*([A-Za-z][A-Za-z\s.'-]{2,50}?)(?:\s*\(|\n|$)",
        r"to\s+Singapore\s+attn\.?\s*:?\s*([A-Za-z][A-Za-z\s.'-]+?)(?:\s*\(|\n)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            cleaned = _clean_owner_name(match.group(1))
            if cleaned and len(cleaned.split()) >= 2:
                return cleaned
    return ""


def _extract_owner(text: str) -> str:
    """Owner: Product Engineer on RMA forms, else attn. contact on DN invoices."""
    engineer = _extract_product_engineer(text)
    if engineer:
        return engineer
    return _extract_attn_owner(text)


def _extract_product_engineer(text: str) -> str:
    match = re.search(
        r"Product\s+Engineer\s*:\s*\n?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+?)(?:\s*\n\s*(?:Special|Prepared)|\s*$)",
        text,
        re.IGNORECASE,
    )
    if not match:
        return ""
    name = match.group(1).strip()
    if name.lower() in ("special instructions", "prepared"):
        return ""
    return name


def _extract_rework_flow(text: str) -> str:
    patterns = [
        r"(Lot\s+received\s*->.+?)(?:\n\n|Requires\s+Future|Product\s+Engineer|Prepared\s+by|Revsion)",
        r"(Re-label\s*->.+?(?:Ship to DCA|Shipout|Ship to)[^.\n]*)",
        r"((?:Re-Pack|Retape|Re-label)[^.\n]{10,200}(?:DCA|Ship)[^.\n]*)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            flow = _normalize_whitespace(match.group(1))
            if len(flow) > 15:
                return flow
    match = re.search(
        r"Work\s*Flow\s*:\s*(.+?)(?:\n\n|Product\s+Engineer|Reasons)",
        text,
        re.I | re.DOTALL,
    )
    if match:
        flow = _normalize_whitespace(match.group(1))
        if len(flow) > 10 and flow.lower() != "reasons of return:":
            return flow
    return ""


def _parse_rma_form(text: str, pdf_path: Path) -> dict[str, Any]:
    """Parse Infineon RMA FORM supplementary documents."""
    if not _is_rma_form(text):
        return {}

    dn_number = _normalize_dn_number(
        _search_pattern(
            text,
            [
                r"Dispatch\s*Note\s*No\.?\s*:?\s*(\d{10})",
                r"(?<!\d)(4038\d{6})(?!\d)",
                r"(?<!\d)(4037\d{6})(?!\d)",
            ],
        )
    )
    if not dn_number:
        fn_match = re.search(r"(\d{10})", pdf_path.stem)
        if fn_match:
            dn_number = fn_match.group(1)

    package, device = _extract_package_device_combo(text)
    filename_bau = _bau_from_filename(pdf_path)
    test_bau = _extract_valid_test_bau(text, filename_bau)
    date_codes = _extract_date_codes(text)

    lot_numbers = []
    for lot in re.findall(r"\b([0-9][A-Z0-9]{9,12})\b", text):
        upper = lot.upper()
        if _is_valid_lot_number(upper, dn_number) and upper not in lot_numbers:
            lot_numbers.append(upper)

    qmr = _search_pattern(text, [r"(QMR\s+\d{2}-\d+)"])
    checked_date = _search_pattern(
        text,
        [r"Date\s+Checked[^\d]*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})"],
    )

    devices = [device] if device else []
    reason_match = re.search(
        r"Reasons\s+of\s+return\s*:?.+?\bof\s+([A-Z]{2,}[A-Z0-9]+)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if reason_match:
        dev = reason_match.group(1).upper()
        if dev not in devices:
            devices.append(dev)

    return {
        "dn_number": dn_number,
        "dn_date": _normalize_date(checked_date) if checked_date else "",
        "device": device,
        "package": package,
        "quantity": _extract_rma_quantity(text),
        "lot_number": lot_numbers[0] if lot_numbers else "",
        "rma_number": qmr,
        "owner": _extract_owner(text),
        "rework_flow_procedure": _extract_rework_flow(text),
        "all_lot_numbers": lot_numbers,
        "all_devices": devices,
        "all_date_codes": date_codes,
        "all_test_bau": test_bau,
        "document_type": "rma_form",
    }


def _parse_qty_number(raw: str) -> float | None:
    token = raw.strip().replace(" ", "")
    if not token:
        return None
    try:
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+(?:\.\d{2})?", token):
            return float(token.replace(",", ""))
        if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:\.\d{2})?", token):
            parts = token.split(".")
            if len(parts[-1]) == 2:
                return float("".join(parts[:-1]) + "." + parts[-1])
            return float("".join(parts))
        if "," in token and "." not in token:
            return float(token.replace(",", "."))
        return float(token.replace(",", ""))
    except ValueError:
        return None


def _extract_line_quantities(text: str) -> list[float]:
    amounts: list[float] = []
    seen_spans: set[tuple[int, int]] = set()
    patterns = [
        r"(\d{1,3}(?:\.\d{3})+(?:\.\d{2})?)\s*T?PCE",
        r"([\d,]+\.\d{2})\s*[|]?\s*PCE",
        r"([\d,]+\.\d{2})\s+PCE",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            span = match.span()
            if any(not (span[1] <= s[0] or span[0] >= s[1]) for s in seen_spans):
                continue
            context = text[max(0, match.start() - 12): match.end() + 4]
            if "/1000" in context.upper() or "/ 1000" in context:
                continue
            value = _parse_qty_number(match.group(1))
            if value is None or value <= 0:
                continue
            amounts.append(value)
            seen_spans.add(span)
    return amounts


def _parse_infineon_dn(text: str, filename_bau: str = "") -> dict[str, Any]:
    """Parse Infineon customs delivery note / dispatch note layout."""

    dn_number = _search_pattern(
        text,
        [
            r"SID\s*\(\s*1[68]K\s*\)\s*[#W]?\s*(\d{10})",
            r"Dispatch\s*Note\s*(?:No\.?)?\s*:?\s*(\d{10})",
        ],
    )
    if not dn_number:
        for match in re.finditer(r"(?<!\d)(403[78]\d{6})(?!\d)", text):
            dn_number = match.group(1)
            break

    dn_date = ""
    date_match = re.search(
        r"DN\s*creat(?:ion)?\s*date.*?(\d{2}\.\d{2}\.\d{4})",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if date_match:
        dn_date = _normalize_date(date_match.group(1))
    else:
        dates = re.findall(r"\b(\d{2}\.\d{2}\.\d{4})\b", text)
        if dates:
            dn_date = _normalize_date(dates[0])

    rma_number = _search_pattern(
        text,
        [r"RMA\s*:\s*([\d]+-[\d]+)", r"(QMR\s+\d{2}-\d+)"],
    )

    customer_name = _format_customer_name(
        _search_pattern(
            text,
            [
                r"(INFINEON\s*TECHNOLOGIES\s*ASIA\s*PACIFIC\s*PTE\s*LTD\.?)",
                r"(INFINEON\s*TECHNOLOGIES[^,\n]{0,80}?PTE\s*LTD\.?)",
            ],
        )
    )

    devices = re.findall(
        r"(?:SAK|AI|IFX|TLE|TLF|BSC|IPD|IRF)-?[A-Z0-9]+(?:-[A-Z0-9]+)*(?:\s*[A-Z]{1,3})?",
        text,
        re.IGNORECASE,
    )
    if not devices:
        devices = re.findall(
            r"(SAK-[A-Z0-9]+-[A-Z0-9]+(?:[A-Z]{1,3})?)",
            text.replace(" ", ""),
            re.IGNORECASE,
        )
    unique_devices: list[str] = []
    for device in devices:
        cleaned = _format_infineon_device(device)
        if cleaned and cleaned not in unique_devices:
            unique_devices.append(cleaned)

    package, rma_device = _extract_package_device_combo(text)
    if rma_device and rma_device not in unique_devices:
        unique_devices.append(rma_device)

    quantities = _extract_line_quantities(text)
    total_quantity = sum(quantities) if quantities else 0.0
    quantity = str(int(total_quantity)) if total_quantity else ""

    plant_code = _search_pattern(text, [r"\bPL\s*(\d{2})\b", r"\bPL(\d{2})\b"])

    material_numbers = re.findall(r"\b(MA\d{9})\b", text)
    lot_candidates = re.findall(r"\b([0-9][A-Z0-9]{9,12})\b", text)
    lots: list[str] = []
    for lot in lot_candidates:
        upper = lot.upper()
        if not _is_valid_lot_number(upper, _normalize_dn_number(dn_number)):
            continue
        if upper not in lots:
            lots.append(upper)

    date_codes = _extract_date_codes(text)
    test_bau = _extract_valid_test_bau(text, filename_bau)

    return {
        "dn_number": _normalize_dn_number(dn_number),
        "dn_date": dn_date,
        "customer_name": customer_name,
        "device": unique_devices[0] if unique_devices else rma_device,
        "package": package,
        "quantity": quantity,
        "lot_number": lots[0] if lots else "",
        "material_number": material_numbers[0] if material_numbers else "",
        "rma_number": rma_number,
        "plant_code": plant_code,
        "owner": _extract_owner(text),
        "rework_flow_procedure": _extract_rework_flow(text),
        "all_lot_numbers": lots,
        "all_devices": unique_devices,
        "all_date_codes": date_codes,
        "all_material_numbers": sorted(set(material_numbers)),
        "all_finished_prod_nos": sorted(set(material_numbers)),
        "all_test_bau": test_bau,
        "document_type": "dispatch_note",
    }


def extract_pages_text(pdf_path: Path) -> list[str]:
    pages: list[str] = []
    try:
        with fitz.open(pdf_path) as doc:
            for page in doc:
                pages.append(page.get_text("text") or "")
    except Exception as exc:
        raise PDFExtractionError(f"Failed to read PDF pages: {exc}") from exc
    return pages


def _parse_generic_dn(text: str, data: dict[str, Any]) -> dict[str, Any]:
    if not data.get("dn_number"):
        data["dn_number"] = _normalize_dn_number(
            _search_pattern(
                text,
                [
                    r"(?:DN|Delivery\s*Note)\s*(?:No\.?|Number|#)?\s*:?\s*(\d{8,12})",
                    r"\bDN\s*(\d{8,12})\b",
                ],
            )
        )

    if not data.get("dn_date"):
        raw_date = _search_pattern(
            text,
            [r"(?:DN\s*Date|Delivery\s*Date|Date\s+Checked)\s*:?\s*([0-9./A-Za-z -]{8,20})"],
        )
        if raw_date:
            data["dn_date"] = _normalize_date(raw_date)

    if not data.get("device"):
        _, device = _extract_package_device_combo(text)
        if device:
            data["device"] = device

    if not data.get("package"):
        pkg, _ = _extract_package_device_combo(text)
        if pkg:
            data["package"] = pkg

    if not data.get("quantity"):
        data["quantity"] = _extract_rma_quantity(text) or _search_pattern(
            text, [r"(?:Qty|Quantity|QTY)\s*:?\s*([\d,]+(?:\.\d+)?)"]
        ).replace(",", "")

    if not data.get("owner"):
        data["owner"] = _extract_owner(text)

    if not data.get("rework_flow_procedure"):
        data["rework_flow_procedure"] = _extract_rework_flow(text)

    return data


def extract_dn_data(
    pdf_file: str | Path,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """
    Stage 1 raw extraction: scan entire PDF, run all parsers, consolidate arrays.
    """
    pdf_path = Path(pdf_file)
    if not pdf_path.exists():
        raise PDFExtractionError(f"File not found: {pdf_path}")

    text = _extract_text(pdf_path, on_progress=on_progress)
    filename_bau = _bau_from_filename(pdf_path)

    dn_from_filename = ""
    filename_match = re.search(r"(\d{10})", pdf_path.stem)
    if filename_match:
        dn_from_filename = filename_match.group(1)

    extractions: list[dict[str, Any]] = []

    rma_data = _parse_rma_form(text, pdf_path)
    if rma_data:
        extractions.append(rma_data)

    dn_data = _parse_infineon_dn(text, filename_bau)
    extractions.append(dn_data)

    generic = _parse_generic_dn(text, {})
    if generic:
        extractions.append(generic)

    data = consolidate_pdf_extractions(extractions)

    if not data.get("dn_number") and dn_from_filename:
        data["dn_number"] = dn_from_filename

    if filename_bau:
        baus = list(data.get("all_test_bau") or [])
        if filename_bau not in baus:
            baus.insert(0, filename_bau)
        data["all_test_bau"] = baus

    data["source_files"] = [pdf_path.name]
    data["page_count"] = _page_count(pdf_path)
    return data


def consolidate_extractions_by_dn(
    extractions: list[tuple[str, dict[str, Any]]],
) -> list[dict[str, Any]]:
    """
    Merge multiple PDF extractions sharing the same DN into one consolidated dict.
    Used by processing pipeline before autofill.
    """
    from collections import defaultdict

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    filenames: dict[str, list[str]] = defaultdict(list)

    for filename, data in extractions:
        dn = str(data.get("dn_number") or "").strip() or f"__file__{filename}"
        groups[dn].append(data)
        filenames[dn].append(filename)

    results: list[dict[str, Any]] = []
    for dn, items in groups.items():
        merged = consolidate_pdf_extractions(items)
        merged["source_files"] = filenames[dn]
        merged["dn_number"] = dn if not dn.startswith("__file__") else merged.get("dn_number", "")
        results.append(merged)
    return results
