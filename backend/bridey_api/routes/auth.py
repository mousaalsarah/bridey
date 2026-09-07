from flask import Blueprint, jsonify, request

from bridey_api import accounts, auth
from bridey_api import db as database

bp = Blueprint("auth", __name__)


def _invalid():
    return jsonify({"error": "INVALID"}), 400


def _unavailable():
    return jsonify({"error": "UNAVAILABLE"}), 503


def _read_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


@bp.post("/api/auth/login")
def login():
    if database.SessionLocal is None:
        return _unavailable()
    body = _read_json()
    if not body:
        return _invalid()
    phone = body.get("phone")
    password = body.get("password")
    if not isinstance(phone, str) or len(phone) < 8 or not isinstance(password, str) or len(password) < 1:
        return _invalid()

    session = database.SessionLocal()
    try:
        artist = accounts.authenticate_artist(session, phone, password)
        if not artist:
            return jsonify({"error": "LOGIN"}), 401
        response = jsonify(
            {
                "id": artist.id,
                "slug": artist.slug,
                "onboardingComplete": artist.onboarding_complete,
            }
        )
        auth.set_artist_session(response, artist.id)
        return response
    finally:
        session.close()


@bp.post("/api/auth/signup")
def signup():
    if database.SessionLocal is None:
        return _unavailable()
    body = _read_json()
    if not body:
        return _invalid()
    name = body.get("name")
    phone = body.get("phone")
    password = body.get("password")
    if (
        not isinstance(name, str)
        or len(name) < 2
        or not isinstance(phone, str)
        or len(phone) < 8
        or not isinstance(password, str)
        or len(password) < 4
    ):
        return _invalid()

    session = database.SessionLocal()
    try:
        artist = accounts.register_artist(session, name, phone, password)
        response = jsonify({"id": artist.id, "slug": artist.slug, "onboardingComplete": False})
        auth.set_artist_session(response, artist.id)
        return response
    except ValueError as exc:
        code = str(exc)
        if code == "PHONE":
            return jsonify({"error": "PHONE"}), 400
        if code == "TAKEN":
            return jsonify({"error": "TAKEN"}), 409
        return _invalid()
    finally:
        session.close()


@bp.post("/api/auth/logout")
def logout():
    response = jsonify({"ok": True})
    auth.clear_artist_session(response)
    return response


@bp.post("/api/admin/login")
def admin_login():
    if database.SessionLocal is None:
        return _unavailable()
    body = _read_json()
    if not body:
        return _invalid()
    email = body.get("email")
    password = body.get("password")
    if not isinstance(email, str) or len(email) < 3 or not isinstance(password, str) or len(password) < 1:
        return _invalid()

    session = database.SessionLocal()
    try:
        admin = accounts.authenticate_admin(session, email, password)
        if not admin:
            return jsonify({"error": "LOGIN"}), 401
        response = jsonify({"id": admin.id, "name": admin.name})
        auth.set_admin_session(response, admin.id)
        return response
    finally:
        session.close()


@bp.post("/api/admin/logout")
def admin_logout():
    response = jsonify({"ok": True})
    auth.clear_admin_session(response)
    return response
