"""Benchmark: existing local OCR pipeline vs Gemini, on real scanned DN PDFs.

This is the hard validation gate for config.settings.GEMINI_SCANNED_PDF_ENABLED.
Gemini must NOT be flipped on for real processing until this script has been
run against real scanned DNs from this project and the results support it -
see the decision rule printed at the end of the report.

Usage:
    venv\\Scripts\\python.exe scripts\\benchmark_gemini_extraction.py <benchmark_dir>

Expected directory layout (category = subfolder name, used only for grouping
in the report - any subfolder name is accepted):

    <benchmark_dir>/
        scanned_single_lot/   *.pdf   (>= 2 recommended)
        scanned_multi_lot/    *.pdf   (>= 2 recommended)
        scanned_multi_page/   *.pdf   (>= 1 recommended)
        scanned_noisy/        *.pdf   (>= 1 recommended - low quality/skewed scan)

PDFs directly inside <benchmark_dir> (not in a subfolder) are grouped under
"uncategorized". Native-text PDFs are skipped with a note - this benchmark is
specifically about the scanned-PDF routing decision; native-text PDFs never
call Gemini regardless (see pdf_extractor.has_native_text), so timing them
here wouldn't inform that decision.

This calls gemini_extractor.extract_dn_data_with_gemini() directly, bypassing
GEMINI_SCANNED_PDF_ENABLED - that's the point of this script: it's how you
generate the evidence needed to decide whether to turn that flag on at all.
Requires GEMINI_API_KEY to be set in backend/.env.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.gemini_extractor import (  # noqa: E402
    GeminiExtractionError,
    extract_dn_data_with_gemini,
)
from app.services.pdf_extractor import extract_dn_data, has_native_text  # noqa: E402
from config.settings import GEMINI_API_KEY, GEMINI_MODEL  # noqa: E402


def _compare_lot_rows(local_rows: list[dict], gemini_rows: list[dict]) -> tuple[int, int]:
    """Returns (rows_matched_by_lot_number, rows_with_qty_or_datecode_mismatch)
    for lot numbers both extractions agree exist - the actual pairing-accuracy
    signal, not just a row count."""
    local_by_lot = {str(r.get("lot_number") or "").strip(): r for r in local_rows if r.get("lot_number")}
    matched = 0
    mismatched = 0
    for grow in gemini_rows:
        lot = str(grow.get("lot_number") or "").strip()
        if not lot or lot not in local_by_lot:
            continue
        matched += 1
        lrow = local_by_lot[lot]
        if (
            str(grow.get("quantity") or "").strip() != str(lrow.get("quantity") or "").strip()
            or str(grow.get("date_code") or "").strip() != str(lrow.get("date_code") or "").strip()
        ):
            mismatched += 1
    return matched, mismatched


def _run_one(pdf_path: Path, category: str) -> dict[str, Any]:
    result: dict[str, Any] = {"file": pdf_path.name, "category": category}

    if has_native_text(pdf_path):
        result["skipped"] = "native-text PDF - Gemini is never used for these, benchmark not applicable"
        return result

    t0 = time.monotonic()
    try:
        local_data = extract_dn_data(pdf_path)
        result["local_time_s"] = round(time.monotonic() - t0, 2)
        result["local_lot_rows"] = len(local_data.get("lot_table_rows") or [])
    except Exception as exc:
        result["local_time_s"] = round(time.monotonic() - t0, 2)
        result["local_error"] = str(exc)
        local_data = {}

    t1 = time.monotonic()
    try:
        gemini_data = extract_dn_data_with_gemini(pdf_path)
        result["gemini_time_s"] = round(time.monotonic() - t1, 2)
        result["gemini_validated"] = True
        result["gemini_lot_rows"] = len(gemini_data.get("lot_table_rows") or [])
        matched, mismatched = _compare_lot_rows(
            local_data.get("lot_table_rows") or [], gemini_data.get("lot_table_rows") or []
        )
        result["lots_matched_by_number"] = matched
        result["lots_with_qty_or_datecode_mismatch"] = mismatched
    except GeminiExtractionError as exc:
        result["gemini_time_s"] = round(time.monotonic() - t1, 2)
        result["gemini_validated"] = False
        result["gemini_fallback_reason"] = str(exc)

    return result


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    if not GEMINI_API_KEY:
        print("GEMINI_API_KEY is not set in backend/.env - cannot run this benchmark.")
        sys.exit(1)

    root = Path(sys.argv[1])
    if not root.is_dir():
        print(f"Not a directory: {root}")
        sys.exit(1)

    print(f"Model under test: {GEMINI_MODEL}\n")

    jobs: list[tuple[Path, str]] = []
    for entry in sorted(root.iterdir()):
        if entry.is_dir():
            for pdf in sorted(entry.glob("*.pdf")):
                jobs.append((pdf, entry.name))
        elif entry.suffix.lower() == ".pdf":
            jobs.append((entry, "uncategorized"))

    if not jobs:
        print(f"No PDFs found under {root} (directly or in subfolders).")
        sys.exit(1)

    results = [_run_one(pdf, category) for pdf, category in jobs]

    header = (
        f"{'file':<40} {'category':<20} {'local_s':>8} {'gemini_s':>9} "
        f"{'valid':>6} {'lot_match':>10} {'mismatch':>9}"
    )
    print(header)
    print("-" * len(header))
    for r in results:
        if "skipped" in r:
            print(f"{r['file']:<40} {r['category']:<20} SKIPPED: {r['skipped']}")
            continue
        print(
            f"{r['file']:<40} {r['category']:<20} "
            f"{r.get('local_time_s', '-'):>8} {r.get('gemini_time_s', '-'):>9} "
            f"{'yes' if r.get('gemini_validated') else 'no':>6} "
            f"{r.get('lots_matched_by_number', '-'):>10} "
            f"{r.get('lots_with_qty_or_datecode_mismatch', '-'):>9}"
        )
        if r.get("gemini_fallback_reason"):
            print(f"    -> fallback reason: {r['gemini_fallback_reason']}")
        if r.get("local_error"):
            print(f"    -> local pipeline error: {r['local_error']}")

    print()
    print("Per-category summary:")
    categories = sorted({r["category"] for r in results if "skipped" not in r})
    for cat in categories:
        rows = [r for r in results if r.get("category") == cat and "skipped" not in r]
        if not rows:
            continue
        n = len(rows)
        gemini_ok = [r for r in rows if r.get("gemini_validated")]
        fallback_count = n - len(gemini_ok)
        avg_local = sum(r.get("local_time_s", 0) for r in rows) / n
        avg_gemini = (
            sum(r["gemini_time_s"] for r in gemini_ok) / len(gemini_ok) if gemini_ok else None
        )
        total_mismatches = sum(r.get("lots_with_qty_or_datecode_mismatch", 0) for r in gemini_ok)
        print(
            f"  {cat}: n={n}  avg_local={avg_local:.2f}s  "
            f"avg_gemini={f'{avg_gemini:.2f}s' if avg_gemini is not None else 'n/a'}  "
            f"fallback_occurrences={fallback_count}/{n}  "
            f"total_lot_pairing_mismatches={total_mismatches}"
        )

    print()
    print("Decision rule (apply per category, from the plan):")
    print("  - Gemini materially faster AND at least as accurate -> enable Gemini for that category.")
    print("  - Gemini slower but materially more accurate on a difficult/multi-lot case ->")
    print("    enable Gemini only for that category.")
    print("  - Gemini slower with no meaningful accuracy advantage -> keep the local OCR pipeline,")
    print("    do not enable Gemini for that category.")
    print()
    print("This script does not flip GEMINI_SCANNED_PDF_ENABLED itself - that decision is yours,")
    print("made from the numbers above, then set manually in backend/.env.")


if __name__ == "__main__":
    main()
