from __future__ import annotations

from sqlalchemy.exc import IntegrityError


class CapacityFullError(Exception):
    def __init__(self, message: str = "CAPACITY_FULL") -> None:
        super().__init__(message)


class WorkspaceError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def is_unique_constraint(error: BaseException) -> bool:
    if not isinstance(error, IntegrityError):
        return False
    text = str(getattr(error, "orig", error)).lower()
    return "unique" in text or "duplicate" in text
