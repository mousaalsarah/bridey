from __future__ import annotations

import os
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from flask import Blueprint, Response, jsonify, request

from bridey_api.config import is_lambda

bp = Blueprint("qr", __name__)


def _app_url() -> str:
    explicit = (os.environ.get("NEXT_PUBLIC_APP_URL") or "").strip().rstrip("/")
    if explicit:
        return explicit
    vercel = (os.environ.get("VERCEL_URL") or "").strip().replace("https://", "").replace("http://", "")
    if vercel:
        return f"https://{vercel}"
    return "http://localhost:3000"


def _allowed_hosts() -> set[str]:
    hosts: set[str] = set()
    try:
        hosts.add(urlparse(_app_url()).netloc)
    except ValueError:
        pass
    try:
        hosts.add(urlparse(request.url).netloc)
    except ValueError:
        pass
    vercel = (os.environ.get("VERCEL_URL") or "").strip().replace("https://", "").replace("http://", "")
    if vercel:
        hosts.add(vercel)
    return {host for host in hosts if host}


def _allowed_url(raw: str) -> bool:
    try:
        target = urlparse(raw)
        if target.scheme not in {"http", "https"}:
            return False
        if target.hostname in {"localhost", "127.0.0.1"}:
            return True
        return target.netloc in _allowed_hosts()
    except ValueError:
        return False


@bp.get("/api/qr")
def qr():
    data = request.args.get("data") or ""
    if not _allowed_url(data):
        return jsonify({"error": "INVALID"}), 400
    if is_lambda() or os.environ.get("VERCEL"):
        return jsonify({"error": "QR"}), 502
    url = f"https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=16&data={quote(data, safe='')}"
    try:
        with urlopen(Request(url, headers={"User-Agent": "bridey"}), timeout=10) as resp:
            payload = resp.read()
            content_type = resp.headers.get("Content-Type", "image/png")
    except Exception:
        return jsonify({"error": "QR"}), 502
    response = Response(payload, mimetype=content_type)
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response
