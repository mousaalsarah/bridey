from flask import Blueprint, jsonify, request
from sqlalchemy import select

from bridey_api.appointment import APPOINTMENT_LOAD
from bridey_api.errors import WorkspaceError
from bridey_api.expire import expire_overdue
from bridey_api.models import Booking
from bridey_api.pass_tokens import can_access_appointment, parse_pass_token, pass_is_available, present_appointment
from bridey_api.routes.helpers import open_session, require_artist
from bridey_api.workspace import require_workspace

bp = Blueprint("pass_lookup", __name__)


@bp.get("/api/pass/<path:token>")
def get_pass(token: str):
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        parsed = parse_pass_token(token) or token.strip()
        if len(parsed) < 32:
            return jsonify({"error": "INVALID_PASS"}), 404
        expire_overdue(session)
        try:
            ws = require_workspace(session, artist)
        except WorkspaceError:
            return jsonify({"error": "FORBIDDEN"}), 403
        booking = session.scalars(
            select(Booking).where(Booking.bridey_pass_token == parsed).options(*APPOINTMENT_LOAD)
        ).first()
        if not booking or not pass_is_available(booking):
            return jsonify({"error": "INVALID_PASS"}), 404
        if not can_access_appointment(ws, booking):
            return jsonify({"error": "FORBIDDEN"}), 403
        payload = present_appointment(
            booking,
            {"memberId": ws["member"].id, "canManageBusiness": ws["permissions"]["canManageBusiness"]},
            ws["business"].name,
        )
        response = jsonify(payload)
        response.headers["Cache-Control"] = "no-store"
        return response
    finally:
        session.close()
