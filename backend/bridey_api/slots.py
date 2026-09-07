from __future__ import annotations

from bridey_api.constants import SLOT_STEP_MIN


def occupy_slot_starts(start_min: int, end_min: int) -> list[int]:
    starts: list[int] = []
    first = (start_min // SLOT_STEP_MIN) * SLOT_STEP_MIN
    t = first
    while t < end_min:
        if t < end_min and t + SLOT_STEP_MIN > start_min:
            starts.append(t)
        t += SLOT_STEP_MIN
    return starts
