from __future__ import annotations

from datetime import datetime, timezone

from bridey_api.constants import SLOT_STEP_MIN
from bridey_api.dates import weekday_of


def occupy_slot_starts(start_min: int, end_min: int) -> list[int]:
    starts: list[int] = []
    first = (start_min // SLOT_STEP_MIN) * SLOT_STEP_MIN
    t = first
    while t < end_min:
        if t < end_min and t + SLOT_STEP_MIN > start_min:
            starts.append(t)
        t += SLOT_STEP_MIN
    return starts


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def hold_is_active(booking, now: datetime | None = None) -> bool:
    moment = now or datetime.now(timezone.utc)
    if booking.status in {"CONFIRMED", "CHECKED_IN", "IN_PROGRESS"}:
        return True
    if booking.status != "PENDING":
        return False
    expires_at = getattr(booking, "expires_at", None)
    if expires_at is None and isinstance(booking, dict):
        expires_at = booking.get("expiresAt") or booking.get("expires_at")
    if not expires_at:
        return True
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    compared = _as_utc(expires_at)
    return compared > moment if compared else True


def generate_slot_states(
    date: str,
    duration_min: int,
    hours: list,
    bookings: list,
    blocked_dates: list[str],
    min_start_min: int = 0,
    now: datetime | None = None,
) -> dict:
    if duration_min <= 0:
        return {"available": [], "held": []}
    if date in blocked_dates:
        return {"available": [], "held": []}
    day = weekday_of(date)
    window = next((row for row in hours if (row.day_of_week if hasattr(row, "day_of_week") else row["dayOfWeek"]) == day), None)
    if not window:
        return {"available": [], "held": []}
    start_min = window.start_min if hasattr(window, "start_min") else window["startMin"]
    end_min = window.end_min if hasattr(window, "end_min") else window["endMin"]
    occupying = [row for row in bookings if hold_is_active(row, now)]
    available: list[int] = []
    held: list[int] = []
    start = start_min
    while start + duration_min <= end_min:
        if start >= min_start_min:
            end = start + duration_min
            clashes = []
            for row in occupying:
                row_start = row.start_min if hasattr(row, "start_min") else row["startMin"]
                row_end = row.end_min if hasattr(row, "end_min") else row["endMin"]
                if start < row_end and end > row_start:
                    clashes.append(row)
            if not clashes:
                available.append(start)
            elif all((row.status if hasattr(row, "status") else row["status"]) == "PENDING" for row in clashes):
                held.append(start)
        start += SLOT_STEP_MIN
    return {"available": available, "held": held}


def generate_slots(
    date: str,
    duration_min: int,
    hours: list,
    bookings: list,
    blocked_dates: list[str],
    min_start_min: int = 0,
) -> list[int]:
    return generate_slot_states(date, duration_min, hours, bookings, blocked_dates, min_start_min)["available"]
