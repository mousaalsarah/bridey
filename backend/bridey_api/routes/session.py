from flask import Blueprint, jsonify, request

from bridey_api import auth
from bridey_api.constants import ADMIN_COOKIE, SESSION_COOKIE
from bridey_api import db as database

bp = Blueprint("session", __name__)


def _unauthorized():
    return jsonify({"error": "UNAUTHORIZED"}), 401


@bp.get("/api/auth/session")
def artist_session():
    token = request.cookies.get(SESSION_COOKIE)
    artist_id = auth.decode_artist_id(token)
    if not artist_id:
        return _unauthorized()

    payload = {"ok": True, "artistId": artist_id}
    if database.SessionLocal is None:
        return jsonify(payload)

    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, token)
        if not artist:
            return _unauthorized()
        payload["name"] = artist.name
        payload["slug"] = artist.slug
        payload["onboardingComplete"] = artist.onboarding_complete
        return jsonify(payload)
    finally:
        session.close()


@bp.get("/api/admin/session")
def admin_session():
    token = request.cookies.get(ADMIN_COOKIE)
    admin_id = auth.decode_admin_id(token)
    if not admin_id:
        return _unauthorized()

    payload = {"ok": True, "adminId": admin_id}
    if database.SessionLocal is None:
        return jsonify(payload)

    session = database.SessionLocal()
    try:
        admin = auth.get_admin(session, token)
        if not admin:
            return _unauthorized()
        payload["email"] = admin.email
        payload["name"] = admin.name
        return jsonify(payload)
    finally:
        session.close()
