from __future__ import annotations

from datetime import datetime

from sqlalchemy import inspect


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.isoformat()
    return value.isoformat().replace("+00:00", "Z")


def to_json(obj, *, skip: set[str] | None = None) -> dict:
    hidden = skip or set()
    out: dict = {}
    mapper = inspect(obj).mapper
    for attr in mapper.column_attrs:
        column = attr.columns[0]
        if column.name in hidden:
            continue
        value = getattr(obj, attr.key)
        if isinstance(value, datetime):
            value = iso(value)
        out[column.name] = value
    return out
