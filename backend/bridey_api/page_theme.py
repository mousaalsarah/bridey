from __future__ import annotations

import re

PAGE_STYLES = ("ivory", "ink", "rose")
PAGE_ACCENTS = ("gold", "blush", "champagne")
COVER_LAYOUTS = ("wide", "portrait", "split")


def normalize_page_style(raw: str) -> str:
    return raw if raw in PAGE_STYLES else "ivory"


def normalize_accent(raw: str) -> str:
    return raw if raw in PAGE_ACCENTS else "gold"


def normalize_cover_layout(raw: str) -> str:
    return raw if raw in COVER_LAYOUTS else "wide"


def clamp_horizon(n: float | int) -> int:
    try:
        value = int(round(float(n)))
    except (TypeError, ValueError):
        return 21
    return min(60, max(7, value))


def clamp_notice(n: float | int) -> int:
    try:
        value = int(round(float(n)))
    except (TypeError, ValueError):
        return 2
    return min(48, max(0, value))


def social_handle(raw: str) -> str:
    text = raw.strip().lstrip("@")
    text = re.sub(r"^https?://(www\.)?(instagram|snapchat)\.com/(add/)?", "", text, flags=re.I)
    return re.split(r"[/?#]", text)[0]
