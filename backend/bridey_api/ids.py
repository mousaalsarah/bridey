from __future__ import annotations

import secrets


def new_id() -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "c" + "".join(secrets.choice(alphabet) for _ in range(24))
