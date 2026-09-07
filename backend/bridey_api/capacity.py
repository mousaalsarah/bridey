from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from bridey_api.constants import DAY_BUCKET
from bridey_api.errors import CapacityFullError, is_unique_constraint
from bridey_api.ids import new_id
from bridey_api.models import CapacityHold


def claim_capacity_seats(
    session: Session,
    *,
    date: str,
    shift_id: str | None,
    booking_id: str,
    member_ids: list[str],
    members: list[dict],
    shift_capacity: int | None,
) -> None:
    unique_ids = list(dict.fromkeys(member_ids))
    for member_id in unique_ids:
        member = next((row for row in members if row["id"] == member_id), None)
        if not member:
            raise CapacityFullError()
        _claim_bucket(
            session,
            team_member_id=member_id,
            date=date,
            bucket=DAY_BUCKET,
            capacity=member["dailyCapacity"],
            booking_id=booking_id,
        )
        if shift_id:
            _claim_bucket(
                session,
                team_member_id=member_id,
                date=date,
                bucket=shift_id,
                capacity=shift_capacity if shift_capacity is not None else member["dailyCapacity"],
                booking_id=booking_id,
            )


def _claim_bucket(
    session: Session,
    *,
    team_member_id: str,
    date: str,
    bucket: str,
    capacity: int,
    booking_id: str,
) -> None:
    if capacity <= 0:
        raise CapacityFullError()
    existing = session.scalars(
        select(CapacityHold).where(
            CapacityHold.team_member_id == team_member_id,
            CapacityHold.date == date,
            CapacityHold.bucket == bucket,
        )
    ).all()
    taken = {row.seat for row in existing}
    for seat in range(capacity):
        if seat in taken:
            continue
        try:
            with session.begin_nested():
                session.add(
                    CapacityHold(
                        id=new_id(),
                        team_member_id=team_member_id,
                        date=date,
                        bucket=bucket,
                        seat=seat,
                        booking_id=booking_id,
                    )
                )
                session.flush()
            return
        except Exception as error:
            if is_unique_constraint(error):
                continue
            raise
    raise CapacityFullError()
