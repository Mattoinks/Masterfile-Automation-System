from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Callable

import fitz

from config.settings import OCR_CACHE_DIR, OCR_RENDER_SCALE


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


def file_content_hash(pdf_path: Path) -> str:
    """SHA-256 of the file's bytes - identifies a PDF by exact content, not
    name/path, so a re-uploaded copy of the same document (byte-identical)
    is recognized even under a different filename."""
    return hashlib.sha256(pdf_path.read_bytes()).hexdigest()


def _persistent_cache_path(file_hash: str, scale: float) -> Path:
    return OCR_CACHE_DIR / f"{file_hash}_{scale}.json"


def load_persistent_ocr_cache(file_hash: str, scale: float) -> dict[int, list[tuple[list[list[float]], str]]]:
    path = _persistent_cache_path(file_hash, scale)
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        return {int(k): [(box, text) for box, text in v] for k, v in raw.items()}
    except (json.JSONDecodeError, OSError, ValueError, TypeError):
        return {}


def save_persistent_ocr_cache(
    file_hash: str, scale: float, cache: dict[int, list[tuple[list[list[float]], str]]]
) -> None:
    path = _persistent_cache_path(file_hash, scale)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({str(k): v for k, v in cache.items()}, f)
    except OSError:
        pass  # Cache write failure should never block real processing.


def render_page_ocr_boxes(
    page: fitz.Page,
    scale: float | None = None,
    cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
    persistent_cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
) -> list[tuple[list[list[float]], str]]:
    """Renders a page and runs OCR, keeping each detection's bounding box.

    RapidOCR's own list order for a dense/borderless table is not reliable
    reading order (columns can interleave) - callers that need to
    reconstruct row/column structure should cluster on the box coordinates
    themselves rather than trust this function's list order.

    If `cache` is given (keyed by page.number), a page already OCR'd earlier
    in the same request is returned from cache instead of being re-rendered
    and re-OCR'd - a DN PDF's header-field pass and its lot-table pass both
    need every page OCR'd, and without this they'd each pay for it separately.

    If `persistent_cache` is given (loaded from disk, keyed by the exact
    same file's content hash), a page already OCR'd in a *previous* request
    for this exact PDF is reused too - reprocessing the same document
    (common while testing, or re-uploading a DN) skips OCR entirely.
    """
    if cache is not None and page.number in cache:
        return cache[page.number]

    if persistent_cache is not None and page.number in persistent_cache:
        boxes = persistent_cache[page.number]
        if cache is not None:
            cache[page.number] = boxes
        return boxes

    scale = OCR_RENDER_SCALE if scale is None else scale
    matrix = fitz.Matrix(scale, scale)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    ocr = _get_ocr_engine()
    result, _ = ocr(pixmap.tobytes("png"))
    boxes = [(line[0], line[1]) for line in result] if result else []

    if cache is not None:
        cache[page.number] = boxes
    if persistent_cache is not None:
        persistent_cache[page.number] = boxes
    return boxes


def _render_page_text(
    page: fitz.Page,
    scale: float | None = None,
    cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
    persistent_cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
) -> str:
    boxes = render_page_ocr_boxes(page, scale, cache, persistent_cache)
    return "\n".join(text for _, text in boxes)


def extract_text_with_ocr(
    pdf_path: Path,
    *,
    max_pages: int = 3,
    stop_when: Callable[[str], bool] | None = None,
    on_page: Callable[[int, int], None] | None = None,
    cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
    persistent_cache: dict[int, list[tuple[list[list[float]], str]]] | None = None,
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
                page_text = _render_page_text(page, cache=cache, persistent_cache=persistent_cache)
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
