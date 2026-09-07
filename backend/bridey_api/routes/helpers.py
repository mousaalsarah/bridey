from flask import jsonify, request

from bridey_api import auth, workspace
from bridey_api import db as database
from bridey_api.constants import ADMIN_COOKIE, SESSION_COOKIE
from bridey_api.errors import WorkspaceError


def unavailable():
    return jsonify({"error": "UNAVAILABLE"}), 503


def open_session():
    if database.SessionLocal is None:
        return None, unavailable()
    return database.SessionLocal(), None


def require_artist(session):
    artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
    if not artist:
        return None, (jsonify({"error": "UNAUTHORIZED"}), 401)
    return artist, None


def require_admin(session):
    admin = auth.get_admin(session, request.cookies.get(ADMIN_COOKIE))
    if not admin:
        return None, (jsonify({"error": "UNAUTHORIZED"}), 401)
    return admin, None


def require_ws(session, artist, permission=None):
    try:
        ws = workspace.require_workspace(session, artist)
        if permission:
            workspace.require_permission(ws, permission)
        return ws, None
    except WorkspaceError as error:
        return None, (jsonify({"error": error.args[0]}), error.status)
