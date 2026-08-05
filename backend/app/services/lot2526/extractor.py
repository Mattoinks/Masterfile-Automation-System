"""Maps raw pdf_extractor.extract_dn_data() output to the 2526 sheet's
DN-breakdown columns (A-H). Reuses the existing extractor's output plus the
position-based lot table reconstruction (lot_table_extractor.py) - does not
add a new PDF parser of its own.
"""

from datetime import date
from typing import Any

# RETOU lot number creation criteria (1st-time split): tens digit of the
# last-2-digits pair maps to a letter, skipping I (visually ambiguous with
# the digit 1). Units digit is kept as-is. E.g. "65" -> "G5".
_TENS_DIGIT_LETTERS = "ABCDEFGHJK"


def suggest_created_lot_no(original_label_lot_no: str) -> str:
    """Suggests a Created Lot# for a lot line, per the confirmed RETOU
    1st-time-split rule: the trailing alphabetic suffix is kept as-is; the
    2 digits immediately before it are replaced in place (tens digit ->
    letter A-K skipping I, units digit unchanged). E.g. 6Q3520365UN ->
    6Q35203G5UN. Deterministic from the original lot number alone, so it's
    computed once per lot line at intake time.

    Returns "" (no suggestion) if the lot number doesn't end in a
    recognizable [[digits]][letters] shape - never guesses in that case.
    """
    s = (original_label_lot_no or "").strip().upper()
    i = len(s)
    while i > 0 and s[i - 1].isalpha():
        i -= 1
    suffix = s[i:]
    body = s[:i]
    if not suffix or len(body) < 2 or not body[-2:].isdigit():
        return ""
    tens, units = body[-2], body[-1]
    new_code = _TENS_DIGIT_LETTERS[int(tens)] + units
    return body[:-2] + new_code + suffix


def _single_row_fallback(dn_data: dict[str, Any]) -> dict[str, str]:
    """Phase 1 behavior: one row, first lot/date code, DN-wide quantity.
    Used whenever the per-lot table can't be confidently reconstructed."""
    lot_list = dn_data.get("all_lot_numbers") or []
    date_code_list = dn_data.get("all_date_codes") or []
    original_label_lot_no = dn_data.get("lot_number") or (lot_list[0] if lot_list else "")

    return {
        "original_label_lot_no": str(original_label_lot_no or ""),
        "date_code": str(date_code_list[0]) if date_code_list else "",
        "return_qty_from_dc": str(dn_data.get("quantity") or ""),
    }


def map_dn_to_breakdown_rows(dn_data: dict[str, Any]) -> list[dict[str, str]]:
    """Returns one field-dict per lot line (each with the 8 breakdown
    fields, Test Bau through LW plus Created Lot#). test_bau is constant
    across the group; original_label_lot_no/date_code/return_qty_from_dc
    are that lot line's own values.

    created_lot_no is computed once here, deterministically, from that same
    row's original_label_lot_no (RETOU 1st-time-split rule) - editable in
    review before saving, and the saved value becomes the source of truth
    from then on (the Cases page later displays/edits it, never
    regenerates it).

    disposition_or_ss_plan_name, lw, physical_lot_qty, and lot_code have no
    corresponding extracted field, so they are always left blank rather
    than guessed or inferred - they're editable manual fields
    (physical_lot_qty/lot_code in case they're already known at intake;
    the other two firmly belong to a later phase).

    date_created and created_date_code are deterministic at intake time
    (unlike physical_lot_qty/lot_code, which usually depend on a physical
    split that hasn't happened yet): date_created is simply today's date
    (the date this breakdown row is being created), and created_date_code
    is the same date code as the original lot line it was split from.
    """
    test_bau_list = dn_data.get("all_test_bau") or []
    test_bau = str(test_bau_list[0]) if test_bau_list else ""
    today = date.today().isoformat()

    lot_table_rows = dn_data.get("lot_table_rows") or []
    if lot_table_rows:
        lot_rows = [
            {
                "original_label_lot_no": str(row.get("lot_number") or ""),
                "date_code": str(row.get("date_code") or ""),
                "return_qty_from_dc": str(row.get("quantity") or ""),
            }
            for row in lot_table_rows
        ]
    else:
        lot_rows = [_single_row_fallback(dn_data)]

    return [
        {
            "test_bau": test_bau,
            "original_label_lot_no": row["original_label_lot_no"],
            "date_code": row["date_code"],
            "return_qty_from_dc": row["return_qty_from_dc"],
            "created_lot_no": suggest_created_lot_no(row["original_label_lot_no"]),
            "disposition_or_ss_plan_name": "",
            "date_attached_ss_plan": "",
            "lw": "",
            "date_created": today,
            "created_date_code": row["date_code"],
            "physical_lot_qty": "",
            "lot_code": "",
        }
        for row in lot_rows
    ]
