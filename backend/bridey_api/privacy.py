from __future__ import annotations

import re

REVEAL_STATUSES = {"CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW"}
EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_CHUNK_RE = re.compile(r"(?:\+?\d[\d\s()./-]{6,20}\d)")
WA_RE = re.compile(r"(?:wa\.me|api\.whatsapp\.com/send\?phone=)/?0*(?:218)?9\d{8}", re.I)
EASTERN = "٠١٢٣٤٥٦٧٨٩"
PERSIAN = "۰۱۲۳۴۵۶۷۸۹"


def fold_digits(raw: str) -> str:
    out = []
    for ch in raw:
        eastern = EASTERN.find(ch)
        if eastern >= 0:
            out.append(str(eastern))
            continue
        persian = PERSIAN.find(ch)
        out.append(str(persian) if persian >= 0 else ch)
    return "".join(out)


def national_mobile_digits(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("218"):
        digits = digits[3:]
    if digits.startswith("0"):
        digits = digits[1:]
    return digits


def looks_like_libya_mobile(raw: str) -> bool:
    return bool(re.fullmatch(r"9\d{8}", national_mobile_digits(fold_digits(raw))))


def notes_contain_contact(raw: str) -> bool:
    text = fold_digits(raw or "")
    if not text.strip():
        return False
    if EMAIL_RE.search(text):
        return True
    if WA_RE.search(text.replace(" ", "")):
        return True
    return any(looks_like_libya_mobile(chunk) for chunk in PHONE_CHUNK_RE.findall(text))


def redact_contact_in_notes(raw: str) -> str:
    text = fold_digits(raw or "")
    if not notes_contain_contact(text):
        return raw or ""
    out = EMAIL_RE.sub("", text)
    out = WA_RE.sub("", out)

    def hide(chunk: str) -> str:
        return "" if looks_like_libya_mobile(chunk) else chunk

    out = PHONE_CHUNK_RE.sub(lambda match: hide(match.group(0)), out)
    return re.sub(r"\s{2,}", " ", out).strip()


def contact_is_unlocked(booking: dict) -> bool:
    origin = booking.get("origin")
    if origin and origin != "public":
        return True
    if booking.get("status") in REVEAL_STATUSES:
        return True
    if booking.get("status") == "CANCELLED" and booking.get("confirmedAt"):
        return True
    return False


def viewer_can_see_bride_contact(booking: dict, viewer: dict) -> bool:
    if not contact_is_unlocked(booking):
        return False
    if viewer.get("canManageBusiness"):
        return True
    member_id = viewer.get("memberId")
    return any(row.get("teamMemberId") == member_id for row in booking.get("assignments") or [])


def present_booking(booking: dict, viewer: dict) -> dict:
    allowed = viewer_can_see_bride_contact(booking, viewer)
    rest = {key: value for key, value in booking.items() if key != "brideyPassToken"}
    rest["bridePhone"] = (booking.get("bridePhone") or "") if allowed else ""
    rest["notes"] = (booking.get("notes") or "") if allowed else redact_contact_in_notes(booking.get("notes") or "")
    rest["artistNotes"] = (booking.get("artistNotes") or "") if viewer.get("canManageBusiness") else ""
    rest["contactAvailable"] = allowed
    return rest
