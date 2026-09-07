from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import select

from bridey_api.expire import expire_overdue
from bridey_api.ids import new_id
from bridey_api.media import MediaError, save_public_image
from bridey_api.models import Booking, PortfolioImage
from bridey_api.routes.helpers import open_session, require_artist, require_ws
from bridey_api.serialize import to_json
from bridey_api.workspace import booking_scope_filters

bp = Blueprint("media_alerts", __name__)


@bp.get("/api/alerts")
def alerts():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist)
        if err:
            return err
        expire_overdue(session, ws["business"].owner_id)
        rows = session.scalars(
            select(Booking)
            .where(*booking_scope_filters(ws), Booking.status == "PENDING")
            .order_by(Booking.date.asc(), Booking.created_at.asc())
        ).all()
        session.commit()
        latest = [{"id": row.id, "brideName": row.bride_name, "date": row.date} for row in rows[:3]]
        return jsonify({"pendingBookings": len(rows), "latest": latest})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/media")
def upload_media():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        uploaded = request.files.get("file")
        if uploaded is None or not uploaded.filename:
            return jsonify({"error": "FILE"}), 400
        kind = request.form.get("kind") or "portfolio"
        caption = request.form.get("caption") or ""
        try:
            url = save_public_image(artist.id, uploaded)
        except MediaError as error:
            return jsonify({"error": error.args[0]}), 400
        if kind == "avatar":
            artist.avatar_url = url
            session.commit()
            return jsonify({"url": artist.avatar_url, "kind": kind})
        if kind == "cover":
            artist.cover_url = url
            session.commit()
            return jsonify({"url": artist.cover_url, "kind": kind})
        image = PortfolioImage(
            id=new_id(),
            artist_id=artist.id,
            url=url,
            caption=caption,
            created_at=datetime.now(timezone.utc),
        )
        session.add(image)
        session.commit()
        session.refresh(image)
        return jsonify(to_json(image))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/portfolio")
def add_portfolio():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        uploaded = request.files.get("file")
        if uploaded is None or not uploaded.filename:
            return jsonify({"error": "FILE"}), 400
        caption = request.form.get("caption") or ""
        try:
            url = save_public_image(artist.id, uploaded)
        except MediaError as error:
            return jsonify({"error": error.args[0]}), 400
        image = PortfolioImage(
            id=new_id(),
            artist_id=artist.id,
            url=url,
            caption=caption,
            created_at=datetime.now(timezone.utc),
        )
        session.add(image)
        session.commit()
        session.refresh(image)
        return jsonify(to_json(image))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.delete("/api/portfolio/<image_id>")
def delete_portfolio(image_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        session.query(PortfolioImage).filter(PortfolioImage.id == image_id, PortfolioImage.artist_id == artist.id).delete()
        session.commit()
        return jsonify({"ok": True})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
