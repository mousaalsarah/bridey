from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from bridey_api.dates import now_minutes_tripoli, today_iso
from bridey_api.models import Booking, Business, CapacityHold, SlotHold


def expire_overdue(session: Session, artist_id: str | None = None) -> list[str]:
    today = today_iso()
    now = datetime.now(timezone.utc)
    now_min = now_minutes_tripoli()
    owned = None
    if artist_id:
        owned = session.scalar(select(Business.id).where(Business.owner_id == artist_id))

    query = select(Booking).where(Booking.status == "PENDING")
    if artist_id or owned:
        filters = []
        if artist_id:
            filters.append(Booking.artist_id == artist_id)
        if owned:
            filters.append(Booking.business_id == owned)
        query = query.where(or_(*filters))
    query = query.where(or_(Booking.expires_at <= now, Booking.date <= today))
    pending = session.scalars(query).all()
    ids = [
        booking.id
        for booking in pending
        if (booking.expires_at and booking.expires_at <= now)
        or booking.date < today
        or (booking.date == today and booking.end_min <= now_min)
    ]
    if not ids:
        return ids
    session.execute(delete(SlotHold).where(SlotHold.booking_id.in_(ids)))
    session.execute(delete(CapacityHold).where(CapacityHold.booking_id.in_(ids)))
    for booking in pending:
        if booking.id in ids:
            booking.status = "EXPIRED"
    return ids
