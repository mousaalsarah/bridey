from __future__ import annotations

import os
import re
import time
from pathlib import Path

from bridey_api.config import REPO_ROOT, is_lambda

ALLOWED = {"jpg", "jpeg", "png", "webp"}
MAX_BYTES = 6 * 1024 * 1024


class MediaError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)


def upload_dir() -> Path:
    override = os.environ.get("BRIDEY_UPLOAD_DIR")
    if override:
        return Path(override)
    return REPO_ROOT / "public" / "uploads"


def save_public_image(artist_id: str, file) -> str:
    if os.environ.get("VERCEL") or is_lambda():
        raise MediaError("STORAGE_UNAVAILABLE")
    data = file.read() if hasattr(file, "read") else file
    if isinstance(data, str):
        data = data.encode("utf-8")
    if len(data) > MAX_BYTES:
        raise MediaError("TOO_LARGE")
    filename = getattr(file, "filename", None) or getattr(file, "name", "") or "image.jpg"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    ext = re.sub(r"[^a-z0-9]", "", ext)
    if ext not in ALLOWED:
        raise MediaError("FILE")
    name = f"{artist_id}-{int(time.time() * 1000)}.{ext}"
    folder = upload_dir()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)
    return f"/uploads/{name}"
