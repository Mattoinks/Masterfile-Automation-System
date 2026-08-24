"""AI-based extraction for scanned/image DN PDFs, using the Gemini API as an
alternative to the local RapidOCR + position-based table clustering path.

Only ever invoked from pdf_extractor.extract_dn_data_smart() for PDFs that
have no native PyMuPDF text layer (i.e. the same PDFs the local pipeline
would otherwise send to OCR) - never for native-text PDFs, and never unless
config.settings.GEMINI_SCANNED_PDF_ENABLED is explicitly true. See
backend/scripts/benchmark_gemini_extraction.py for the benchmark that
decides whether that flag should be on for a given deployment.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from config.settings import GEMINI_MODEL

EXTRACTION_PROMPT = """You are extracting structured data from a Delivery Note (DN) or RMA form PDF for an electronics component RMA tracking system. The document may be a native-text PDF or a scanned/image-based PDF — read it as carefully as a human reviewer would, including any rotated, low-contrast, or handwritten-looking table content.

Return a single JSON object matching the provided schema. Use "" for any text field you cannot find, and [] for any list field with no entries. Do not guess or fabricate values — if a field is genuinely absent from the document, leave it empty rather than inferring it.

Field notes:
- "dn_number": the delivery note / dispatch note number (top-of-document reference number, not the RMA number).
- "rma_number": the RMA reference number, if present, distinct from dn_number.
- "quantity" / "lot_number" / "device" / "material_number": the single PRIMARY value for the document as a whole (e.g. what's in the document header, or the first/only lot if there's just one). If the document has a multi-row lot table, these still get the header-level or first-row value — the per-row detail belongs in lot_table_rows.
- The "all_*" fields are deduplicated lists of every distinct value of that type found anywhere in the document.
- "all_finished_prod_nos": finished product / finished goods numbers, if the document labels any values this way (may be empty).
- "all_test_bau": test/BAU (business-as-usual) flow references, if present (may be empty).
- "document_type": classify as either "dispatch_note" or "rma_form" based on the document's own header/title and structure.

CRITICAL — lot_table_rows (the most important part of this task):
Find the table listing individual lots (columns for lot number, date code, and quantity, sometimes with additional columns you should ignore). Read it ROW BY ROW, exactly as laid out in the document, and produce one object per row.

Rules for this field specifically:
1. Never mix values from different rows — each lot_number must be paired with the quantity and date_code that appear in the SAME row of the table, not the nearest visually-adjacent value.
2. Preserve the table's original row order.
3. If a row has a lot number but a missing/blank quantity or date code, still include the row with that field as "".
4. If date codes or quantities appear stacked/wrapped across multiple lines within a single row, treat them as belonging to that one row, not as separate rows.
5. If the table has merged/spanning cells (e.g. one date code covering multiple lot-number rows), replicate that date code into each corresponding row rather than leaving it blank.
6. Double-check your row count against the visible number of distinct lot numbers in the table before finalizing.
"""


class GeminiLotTableRow(BaseModel):
    lot_number: str = ""
    quantity: str = ""
    date_code: str = ""


class GeminiExtractionSchema(BaseModel):
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
    owner: str = ""
    rework_flow_procedure: str = ""
    all_lot_numbers: list[str] = Field(default_factory=list)
    all_devices: list[str] = Field(default_factory=list)
    all_date_codes: list[str] = Field(default_factory=list)
    all_material_numbers: list[str] = Field(default_factory=list)
    all_finished_prod_nos: list[str] = Field(default_factory=list)
    all_test_bau: list[str] = Field(default_factory=list)
    document_type: str = ""
    lot_table_rows: list[GeminiLotTableRow] = Field(default_factory=list)


class GeminiExtractionError(Exception):
    """General Gemini extraction failure (network, malformed response, safety block, timeout)."""


class GeminiQuotaExhaustedError(GeminiExtractionError):
    """Free-tier quota exhausted for this model/project."""


class GeminiModelUnavailableError(GeminiExtractionError):
    """The configured GEMINI_MODEL is not available to this API project."""


def _classify_error(exc: Exception) -> GeminiExtractionError:
    """Map an SDK exception onto one of the three fallback-triggering categories,
    purely for distinct logging - all three are handled identically by the caller."""
    status = str(getattr(exc, "status", "") or "").upper()
    code = getattr(exc, "code", None)
    message = str(exc).upper()

    if code == 429 or "RESOURCE_EXHAUSTED" in status or "RESOURCE_EXHAUSTED" in message or "QUOTA" in message:
        return GeminiQuotaExhaustedError(str(exc))
    if (
        code == 404
        or "NOT_FOUND" in status
        or "NOT_FOUND" in message
        or "NOT SUPPORTED" in message
        or "PERMISSION_DENIED" in status
    ):
        return GeminiModelUnavailableError(str(exc))
    return GeminiExtractionError(str(exc))


def _to_output_dict(parsed: GeminiExtractionSchema) -> dict[str, Any]:
    data = parsed.model_dump()
    data["lot_table_rows"] = [row.model_dump() for row in parsed.lot_table_rows]
    return data


def _validate_extraction(data: dict[str, Any]) -> bool:
    """Lightweight sanity gate on Gemini's output before it's trusted - mirrors
    the manual consistency checks used to verify the AI Studio test results.
    Anything failing this is treated like an extraction failure by the caller."""
    lot_rows = data.get("lot_table_rows") or []
    all_lots = data.get("all_lot_numbers") or []
    if len(lot_rows) != len(all_lots):
        return False

    raw_quantity = str(data.get("quantity") or "").replace(",", "").strip()
    if raw_quantity:
        try:
            header_qty = float(raw_quantity)
        except ValueError:
            header_qty = None
        if header_qty is not None and lot_rows:
            row_total = 0.0
            has_numeric_row = False
            for row in lot_rows:
                raw_row_qty = str(row.get("quantity") or "").replace(",", "").strip()
                if not raw_row_qty:
                    continue
                try:
                    row_total += float(raw_row_qty)
                    has_numeric_row = True
                except ValueError:
                    return False
            if has_numeric_row and abs(row_total - header_qty) > max(1.0, header_qty * 0.01):
                return False

    if not (str(data.get("dn_number") or "").strip() or str(data.get("rma_number") or "").strip()):
        return False

    return True


def extract_dn_data_with_gemini(pdf_path: Path) -> dict[str, Any]:
    """Sends the PDF to Gemini for structured extraction. Raises one of the
    three GeminiExtractionError subclasses on any failure - callers must
    catch these and fall back to the existing local pipeline, never retry
    against a different model."""
    from config.settings import GEMINI_API_KEY

    if not GEMINI_API_KEY:
        raise GeminiExtractionError("GEMINI_API_KEY is not configured")

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise GeminiExtractionError(
            "google-genai package is not installed (pip install -r requirements.txt)"
        ) from exc

    try:
        pdf_bytes = pdf_path.read_bytes()
    except OSError as exc:
        raise GeminiExtractionError(f"Failed to read PDF: {exc}") from exc

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                EXTRACTION_PROMPT,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiExtractionSchema,
                temperature=0,
            ),
        )
    except Exception as exc:
        raise _classify_error(exc) from exc

    parsed = getattr(response, "parsed", None)
    if parsed is None:
        try:
            parsed = GeminiExtractionSchema.model_validate_json(response.text)
        except Exception as exc:
            raise GeminiExtractionError(f"Failed to parse Gemini response: {exc}") from exc

    data = _to_output_dict(parsed)
    if not _validate_extraction(data):
        raise GeminiExtractionError("Gemini output failed validation (row count/quantity-sum/identity checks)")

    return data
