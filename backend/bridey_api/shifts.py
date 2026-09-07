from __future__ import annotations

from typing import TypedDict


class ShiftDraft(TypedDict):
    key: str
    nameAr: str
    nameEn: str
    startMin: int
    endMin: int
    sortOrder: int


def derive_shifts_from_window(start_min: int, end_min: int) -> list[ShiftDraft]:
    split = 14 * 60
    if end_min <= start_min:
        return [{"key": "day", "nameAr": "اليوم", "nameEn": "Day", "startMin": 10 * 60, "endMin": 20 * 60, "sortOrder": 0}]
    if start_min < split and end_min > split:
        return [
            {"key": "morning", "nameAr": "صباح", "nameEn": "Morning", "startMin": start_min, "endMin": split, "sortOrder": 0},
            {"key": "evening", "nameAr": "مساء", "nameEn": "Evening", "startMin": split, "endMin": end_min, "sortOrder": 1},
        ]
    if end_min <= split:
        return [{"key": "morning", "nameAr": "صباح", "nameEn": "Morning", "startMin": start_min, "endMin": end_min, "sortOrder": 0}]
    return [{"key": "evening", "nameAr": "مساء", "nameEn": "Evening", "startMin": start_min, "endMin": end_min, "sortOrder": 0}]


def typical_window(hours: list[tuple[int, int]] | list) -> dict[str, int]:
    if not hours:
        return {"startMin": 10 * 60, "endMin": 20 * 60}
    starts = [h.start_min if hasattr(h, "start_min") else h[0] for h in hours]
    ends = [h.end_min if hasattr(h, "end_min") else h[1] for h in hours]
    return {"startMin": min(starts), "endMin": max(ends)}
