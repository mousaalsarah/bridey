from flask import Blueprint, jsonify

from bridey_api.constants import PLATFORM_FEE_LYD
from bridey_api import db as database

bp = Blueprint("health", __name__)


@bp.get("/health")
@bp.get("/api/health")
def health():
    db_ok = False
    if database.engine is not None:
        try:
            db_ok = database.ping()
        except Exception:
            db_ok = False
    return jsonify(
        {
            "ok": True,
            "service": "bridey-flask",
            "platformFeeLyd": PLATFORM_FEE_LYD,
            "database": "ok" if db_ok else ("error" if database.engine is not None else "unconfigured"),
        }
    )
