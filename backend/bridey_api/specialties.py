from __future__ import annotations

from bridey_api.constants import SPECIALTIES


def parse_specialties(raw: str | list[str] | None) -> list[str]:
    items = raw if isinstance(raw, list) else (raw or "").split(",")
    ids = [item.strip() for item in items if item and item.strip()]
    known = [item for item in ids if item in SPECIALTIES]
    unique: list[str] = []
    for item in known:
        if item not in unique:
            unique.append(item)
    return unique or ["makeup"]


def join_specialties(raw: str | list[str] | None) -> str:
    return ",".join(parse_specialties(raw))
