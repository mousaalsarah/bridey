from __future__ import annotations

import re
import secrets
import unicodedata


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("218"):
        return digits
    if digits.startswith("0") and len(digits) >= 9:
        return f"218{digits[1:]}"
    if digits.startswith("9") and len(digits) >= 8:
        return f"218{digits}"
    return digits


def is_libya_phone(raw: str) -> bool:
    return bool(re.fullmatch(r"2189\d{8}", normalize_phone(raw)))


def slugify(name: str) -> str:
    latin = unicodedata.normalize("NFKD", name).lower()
    latin = re.sub(r"[^a-z0-9]+", "-", latin).strip("-")
    if len(latin) >= 3:
        return latin[:32]
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    suffix = "".join(secrets.choice(alphabet) for _ in range(4))
    return f"artist-{suffix}"
