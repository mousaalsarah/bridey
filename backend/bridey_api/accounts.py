from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from bridey_api.auth import hash_password, verify_password
from bridey_api.ids import new_id
from bridey_api.models import Admin, Artist, TeamMember
from bridey_api.phones import is_libya_phone, normalize_phone, slugify


def find_artist_by_phone(session: Session, raw_phone: str) -> Artist | None:
    return session.scalar(select(Artist).where(Artist.phone == normalize_phone(raw_phone)))


def authenticate_artist(session: Session, raw_phone: str, password: str) -> Artist | None:
    artist = find_artist_by_phone(session, raw_phone)
    if not artist or not verify_password(password, artist.password_hash):
        return None
    return artist


def authenticate_admin(session: Session, email: str, password: str) -> Admin | None:
    admin = session.scalar(select(Admin).where(Admin.email == email.strip().lower()))
    if not admin or not verify_password(password, admin.password_hash):
        return None
    return admin


def register_artist(session: Session, name: str, raw_phone: str, password: str) -> Artist:
    phone = normalize_phone(raw_phone)
    if not is_libya_phone(phone):
        raise ValueError("PHONE")
    if find_artist_by_phone(session, phone):
        raise ValueError("TAKEN")

    slug = slugify(name)
    taken = session.scalar(select(Artist).where(Artist.slug == slug))
    if taken:
        slug = f"{slug}-{phone[-4:]}"

    now = datetime.now(timezone.utc)
    artist = Artist(
        id=new_id(),
        name=name.strip(),
        phone=phone,
        password_hash=hash_password(password),
        slug=slug,
        whatsapp=phone,
        created_at=now,
        updated_at=now,
    )
    session.add(artist)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise ValueError("TAKEN") from exc

    invite = session.scalar(
        select(TeamMember).where(
            TeamMember.phone == phone,
            TeamMember.artist_id.is_(None),
            TeamMember.status == "ACTIVE",
        )
    )
    if invite:
        invite.artist_id = artist.id
        if not invite.name:
            invite.name = artist.name
        session.add(invite)

    session.commit()
    session.refresh(artist)
    return artist
