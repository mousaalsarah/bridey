from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from bridey_api.dates import shift_month, today_iso
from bridey_api.models import Artist, PlatformFee, SubscriptionPayment


def month_bounds(month: str) -> dict:
    safe = month if re.fullmatch(r"\d{4}-\d{2}", month or "") else today_iso()[:7]
    nxt = shift_month(safe, 1)
    start = datetime.fromisoformat(f"{safe}-01T00:00:00+02:00").astimezone(timezone.utc).replace(tzinfo=None)
    end = datetime.fromisoformat(f"{nxt}-01T00:00:00+02:00").astimezone(timezone.utc).replace(tzinfo=None)
    return {"month": safe, "start": start, "end": end, "next": nxt}


def available_months(session: Session) -> list[str]:
    current = today_iso()[:7]
    first_fee = session.scalar(select(PlatformFee.created_at).order_by(PlatformFee.created_at.asc()))
    first_pay = session.scalar(
        select(SubscriptionPayment.reviewed_at)
        .where(SubscriptionPayment.status == "CONFIRMED", SubscriptionPayment.reviewed_at.is_not(None))
        .order_by(SubscriptionPayment.reviewed_at.asc())
    )
    starts = [value for value in (first_fee, first_pay) if value]
    if starts:
        earliest_dt = min(starts)
        earliest = earliest_dt.isoformat()[:7]
    else:
        earliest = current
    months: list[str] = []
    cursor = earliest
    while cursor <= current:
        months.append(cursor)
        cursor = shift_month(cursor, 1)
    months.reverse()
    return months


def revenue_for_month(session: Session, month: str) -> dict:
    bounds = month_bounds(month)
    start, end = bounds["start"], bounds["end"]
    fee_rows = session.execute(
        select(PlatformFee.artist_id, func.sum(PlatformFee.amount_lyd), func.count())
        .where(PlatformFee.created_at >= start, PlatformFee.created_at < end)
        .group_by(PlatformFee.artist_id)
    ).all()
    pay_rows = session.execute(
        select(SubscriptionPayment.artist_id, func.sum(SubscriptionPayment.amount_lyd), func.count())
        .where(
            SubscriptionPayment.status == "CONFIRMED",
            SubscriptionPayment.reviewed_at >= start,
            SubscriptionPayment.reviewed_at < end,
        )
        .group_by(SubscriptionPayment.artist_id)
    ).all()
    due_rows = session.execute(
        select(PlatformFee.artist_id, func.sum(PlatformFee.amount_lyd))
        .where(PlatformFee.status == "UNPAID")
        .group_by(PlatformFee.artist_id)
    ).all()
    ids = list({row[0] for row in fee_rows} | {row[0] for row in pay_rows})
    artists = session.scalars(select(Artist).where(Artist.id.in_(ids))).all() if ids else []
    by_id = {artist.id: artist for artist in artists}
    pay_by_id = {row[0]: row for row in pay_rows}
    due_by_id = {row[0]: int(row[1] or 0) for row in due_rows}
    rows = []
    fee_ids = {row[0] for row in fee_rows}
    for artist_id, amount, count in fee_rows:
        artist = by_id.get(artist_id)
        collected = int(pay_by_id.get(artist_id, (None, 0, 0))[1] or 0)
        rows.append(
            {
                "artistId": artist_id,
                "name": artist.name if artist else "خبيرة",
                "slug": artist.slug if artist else "",
                "neighborhood": artist.neighborhood if artist else "",
                "generatedLyd": int(amount or 0),
                "bookingCount": int(count or 0),
                "collectedLyd": collected,
                "outstandingLyd": due_by_id.get(artist_id) or 0,
            }
        )
    for artist_id, amount, _count in pay_rows:
        if artist_id in fee_ids:
            continue
        artist = by_id.get(artist_id)
        rows.append(
            {
                "artistId": artist_id,
                "name": artist.name if artist else "خبيرة",
                "slug": artist.slug if artist else "",
                "neighborhood": artist.neighborhood if artist else "",
                "generatedLyd": 0,
                "bookingCount": 0,
                "collectedLyd": int(amount or 0),
                "outstandingLyd": due_by_id.get(artist_id) or 0,
            }
        )
    rows.sort(key=lambda row: (-row["generatedLyd"], -row["collectedLyd"]))
    generated = sum(row["generatedLyd"] for row in rows)
    collected = sum(row["collectedLyd"] for row in rows)
    booking_count = sum(row["bookingCount"] for row in rows)
    top = rows[0] if rows else None
    return {
        "month": month,
        "generatedLyd": generated,
        "collectedLyd": collected,
        "bookingCount": booking_count,
        "artistCount": len(rows),
        "collectionRate": round((collected / generated) * 100) if generated else (100 if collected else 0),
        "topArtist": {
            "artistId": top["artistId"],
            "name": top["name"],
            "slug": top["slug"],
            "generatedLyd": top["generatedLyd"],
            "share": round((top["generatedLyd"] / generated) * 100) if generated else 0,
        }
        if top
        else None,
        "artists": [
            {
                **row,
                "rank": index + 1,
                "share": round((row["generatedLyd"] / generated) * 100) if generated else 0,
            }
            for index, row in enumerate(rows)
        ],
    }


def revenue_trend(session: Session, end_month: str, count: int = 6) -> list[dict]:
    months = [shift_month(end_month, -i) for i in range(count - 1, -1, -1)]
    points = []
    for month in months:
        bounds = month_bounds(month)
        generated = session.execute(
            select(func.coalesce(func.sum(PlatformFee.amount_lyd), 0), func.count())
            .where(PlatformFee.created_at >= bounds["start"], PlatformFee.created_at < bounds["end"])
        ).one()
        collected = session.scalar(
            select(func.coalesce(func.sum(SubscriptionPayment.amount_lyd), 0)).where(
                SubscriptionPayment.status == "CONFIRMED",
                SubscriptionPayment.reviewed_at >= bounds["start"],
                SubscriptionPayment.reviewed_at < bounds["end"],
            )
        )
        points.append(
            {
                "month": month,
                "generatedLyd": int(generated[0] or 0),
                "collectedLyd": int(collected or 0),
                "bookingCount": int(generated[1] or 0),
            }
        )
    return points
