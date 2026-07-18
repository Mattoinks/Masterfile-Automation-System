from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Callable

import fitz

from config.settings import OCR_RENDER_SCALE


class OCRExtractionError(Exception):
    pass


class OCRUnavailableError(OCRExtractionError):
    """Raised when RapidOCR / ONNX deps are not installed."""


@lru_cache(maxsize=1)
def _get_ocr_engine():
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as exc:
        raise OCRUnavailableError(
            "OCR dependencies are not installed. Install full requirements "
            "(pip install -r requirements.txt) to process scanned/image-only PDFs."
        ) from exc
    return RapidOCR()


def _render_page_text(page: fitz.Page, scale: float | None = None) -> str:
    scale = OCR_RENDER_SCALE if scale is None else scale
    matrix = fitz.Matrix(scale, scale)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    ocr = _get_ocr_engine()
    result, _ = ocr(pixmap.tobytes("png"))
    if not result:
        return ""
    return "\n".join(line[1] for line in result)


def extract_text_with_ocr(
    pdf_path: Path,
    *,
    max_pages: int = 3,
    stop_when: Callable[[str], bool] | None = None,
    on_page: Callable[[int, int], None] | None = None,
) -> str:
    """OCR fallback for scanned/image-only DN PDFs."""
    text_parts: list[str] = []
    try:
        with fitz.open(pdf_path) as doc:
            page_limit = min(max_pages, doc.page_count)
            for index, page in enumerate(doc):
                if index >= max_pages:
                    break
                if on_page:
                    on_page(index + 1, page_limit)
                page_text = _render_page_text(page)
                if page_text.strip():
                    text_parts.append(page_text)
                combined = "\n".join(text_parts)
                if stop_when and combined.strip() and stop_when(combined):
                    return combined
    except OCRUnavailableError:
        raise
    except Exception as exc:
        raise OCRExtractionError(f"Failed to OCR PDF: {exc}") from exc

    combined = "\n".join(text_parts)
    if not combined.strip():
        raise OCRExtractionError("OCR produced no readable text from PDF")
    return combined
