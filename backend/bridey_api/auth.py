from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os

import bcrypt
import jwt
from sqlalchemy.orm import Session

from flask import Response

from bridey_api.config import admin_secret_value, auth_secret_value, is_deployed_runtime
from bridey_api.constants import (
    ADMIN_COOKIE,
    ADMIN_SESSION_DAYS,
    SESSION_COOKIE,
    SESSION_DAYS,
)
from bridey_api.models import Admin, Artist


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _encode(payload: dict, secret: str, days: int) -> str:
    now = datetime.now(timezone.utc)
    body = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=days)).timestamp()),
    }
    return jwt.encode(body, secret, algorithm="HS256")


def create_artist_token(artist_id: str) -> str:
    return _encode({"sub": artist_id}, auth_secret_value(), SESSION_DAYS)


def create_admin_token(admin_id: str) -> str:
    return _encode({"sub": admin_id, "role": "admin"}, admin_secret_value(), ADMIN_SESSION_DAYS)


def decode_artist_id(token: str | None) -> str | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, auth_secret_value(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) and sub else None


def decode_admin_id(token: str | None) -> str | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, admin_secret_value(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("role") != "admin":
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) and sub else None


def get_artist(session: Session, token: str | None) -> Artist | None:
    artist_id = decode_artist_id(token)
    if not artist_id:
        return None
    return session.get(Artist, artist_id)


def get_admin(session: Session, token: str | None) -> Admin | None:
    admin_id = decode_admin_id(token)
    if not admin_id:
        return None
    return session.get(Admin, admin_id)


def _cookie_flags(max_age: int) -> dict:
    return {
        "httponly": True,
        "samesite": "Lax",
        "secure": is_deployed_runtime() or os.environ.get("NODE_ENV") == "production",
        "path": "/",
        "max_age": max_age,
    }


def set_artist_session(response: Response, artist_id: str) -> None:
    response.set_cookie(SESSION_COOKIE, create_artist_token(artist_id), **_cookie_flags(60 * 60 * 24 * SESSION_DAYS))


def set_admin_session(response: Response, admin_id: str) -> None:
    response.set_cookie(ADMIN_COOKIE, create_admin_token(admin_id), **_cookie_flags(60 * 60 * 24 * ADMIN_SESSION_DAYS))


def clear_artist_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


def clear_admin_session(response: Response) -> None:
    response.delete_cookie(ADMIN_COOKIE, path="/")
