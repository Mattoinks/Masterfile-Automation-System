import re
from pathlib import Path
from typing import Any, Callable

import fitz  # PyMuPDF
import pdfplumber

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


def _has_sufficient_dn_text(text: str) -> bool:
    """Keep OCR going until qty and date codes are found (often on page 2)."""
    data = _parse_infineon_dn(text)
    if not data.get("dn_number") or not data.get("device"):
        return False
    has_qty = bool(str(data.get("quantity") or "").strip())
    has_dates = bool(data.get("all_date_codes"))
    return has_qty and has_dates


def _parse_qty_number(raw: str) -> float | None:
    """Parse Infineon quantity tokens from OCR (e.g. 10.000.00, 15,000.00)."""
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
    """Sum DN line quantities; ignore unit-price fragments like /1000PCE."""
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


def _extract_text(pdf_path: Path, on_progress: ProgressCallback | None = None) -> str:
    """Extract text with a single PyMuPDF pass; OCR only for scanned PDFs."""
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
            page_total = min(3, doc.page_count)
    except Exception as exc:
        raise PDFExtractionError(f"Failed to read PDF with PyMuPDF: {exc}") from exc

    if has_images:
        try:
            def on_page(page: int, total: int) -> None:
                if on_progress:
                    on_progress("ocr", f"OCR page {page}/{total}")

            if on_progress:
                on_progress("ocr", f"Scanned PDF — starting OCR (up to {page_total} page(s))…")

            text = extract_text_with_ocr(
                pdf_path,
                max_pages=3,
                stop_when=_has_sufficient_dn_text,
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
    ]:
        match = re.search(fmt_match, raw)
        if match:
            groups = match.groups()
            if len(groups[0]) == 4:
                year, month, day = groups
            else:
                day, month, year = groups
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


def _extract_date_codes(text: str) -> list[str]:
    codes = re.findall(r"\b(24\d{2}|25\d{2})\b", text)
    valid: list[str] = []
    for code in codes:
        num = int(code)
        if 2400 <= num <= 2620 and code not in valid:
            valid.append(code)
    return sorted(valid, key=int)


def _parse_infineon_dn(text: str) -> dict[str, Any]:
    """Parse Infineon customs delivery note layout (scanned or text PDF)."""

    dn_number = _search_pattern(
        text,
        [
            r"SID\s*\(\s*16K\s*\)\s*#\s*(\d{10})",
            r"(?<!\d)(\d{10})(?!\d)",
        ],
    )

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
        [
            r"RMA\s*:\s*([\d]+-[\d]+)",
            r"RMA\s*:\s*([\d-]+)",
        ],
    )

    customer_name = _search_pattern(
        text,
        [
            r"(INFINEON\s*TECHNOLOGIES\s*ASIA\s*PACIFIC\s*PTE\s*LTD\.?)",
            r"(INFINEON\s*TECHNOLOGIES[^,\n]{0,80}?PTE\s*LTD\.?)",
            r"(INFINEONTECHNOLOGIESASIAPACIFICPTE\s*LTD\.?)",
        ],
    )
    customer_name = _format_customer_name(customer_name)

    devices = re.findall(
        r"(?:SAK|AI|IFX|TLE|BSC|IPD|IRF)-[A-Z0-9]+(?:-[A-Z0-9]+)*(?:\s*[A-Z]{1,3})?",
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
    device = unique_devices[0] if unique_devices else ""

    quantities = _extract_line_quantities(text)
    total_quantity = sum(quantities) if quantities else 0.0
    quantity = str(int(total_quantity)) if total_quantity else ""

    plant_code = _search_pattern(text, [r"\bPL\s*(\d{2})\b", r"\bPL(\d{2})\b"])
    package = ""

    material_numbers = re.findall(r"\b(MA\d{9})\b", text)
    material_number = material_numbers[0] if material_numbers else ""

    lot_candidates = re.findall(r"\b([0-9][A-Z0-9]{9,12})\b", text)
    lots: list[str] = []
    for lot in lot_candidates:
        upper = lot.upper()
        if not _is_valid_lot_number(upper, _normalize_dn_number(dn_number)):
            continue
        if upper in lots:
            continue
        lots.append(upper)
    lot_number = lots[0] if lots else ""

    date_codes = _extract_date_codes(text)
    finished_prod = sorted(set(re.findall(r"\b(MA\d{9})\b", text)))
    test_bau_candidates = sorted(set(re.findall(r"\b(\d{8})\b", text)))

    carton_count = _search_pattern(text, [r"Total\s+(\d+)\s+[\d.,]+\s*kg", r"Total\s+(\d+)\b"])
    num_packages = _search_pattern(text, [r"\bNum\.\s*(\d+)\b"])

    return {
        "dn_number": _normalize_dn_number(dn_number),
        "dn_date": dn_date,
        "customer_name": customer_name,
        "device": device,
        "package": package,
        "quantity": quantity,
        "lot_number": lot_number,
        "material_number": material_number,
        "rma_number": rma_number,
        "plant_code": plant_code,
        "carton_count": carton_count or num_packages,
        "all_lot_numbers": lots,
        "all_devices": unique_devices,
        "all_date_codes": date_codes,
        "all_material_numbers": sorted(set(material_numbers)),
        "all_finished_prod_nos": finished_prod,
        "all_test_bau": test_bau_candidates,
    }


def extract_dn_data(
    pdf_file: str | Path,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    """
    Extract DN fields from Infineon delivery note PDFs.
    Uses text extraction first, then OCR for scanned documents.
    """
    pdf_path = Path(pdf_file)
    if not pdf_path.exists():
        raise PDFExtractionError(f"File not found: {pdf_path}")

    text = _extract_text(pdf_path, on_progress=on_progress)

    dn_from_filename = ""
    filename_match = re.search(r"DN?(\d{10})", pdf_path.stem, re.IGNORECASE)
    if filename_match:
        dn_from_filename = filename_match.group(1)

    data = _parse_infineon_dn(text)

    if not data["dn_number"] and dn_from_filename:
        data["dn_number"] = dn_from_filename

    if not data["dn_number"]:
        data = _parse_generic_dn(text, data)

    return data


def _parse_generic_dn(text: str, data: dict[str, Any]) -> dict[str, Any]:
    """Fallback patterns for non-Infineon DN layouts."""
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
            [
                r"(?:DN\s*Date|Delivery\s*Date|Date)\s*:?\s*([0-9./-]{8,12})",
            ],
        )
        data["dn_date"] = _normalize_date(raw_date)

    if not data.get("device"):
        data["device"] = _search_pattern(
            text,
            [r"(?:Device|Product|Part\s*Name)\s*:?\s*([A-Z0-9][\w./-]{2,40})"],
        )

    if not data.get("package"):
        data["package"] = _search_pattern(
            text,
            [r"(?:Package|Pkg|Packaging)\s*:?\s*([A-Z0-9][\w./-]{1,30})"],
        )

    if not data.get("quantity"):
        qty = _search_pattern(
            text,
            [r"(?:Qty|Quantity|QTY)\s*:?\s*([\d,]+(?:\.\d+)?)"],
        )
        data["quantity"] = qty.replace(",", "")

    if not data.get("lot_number"):
        data["lot_number"] = _search_pattern(
            text,
            [r"(?:Lot\s*(?:No\.?|Number|#)?)\s*:?\s*([A-Z0-9][\w-]{2,30})"],
        )

    if not data.get("material_number"):
        data["material_number"] = _search_pattern(
            text,
            [r"(?:Material\s*(?:No\.?|Number|#)?)\s*:?\s*([A-Z0-9][\w-]{2,30})"],
        )

    return data
