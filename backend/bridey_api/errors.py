from __future__ import annotations

from sqlalchemy.exc import IntegrityError


class CapacityFullError(Exception):
    def __init__(self, message: str = "CAPACITY_FULL") -> None:
        super().__init__(message)


class PreferredUnavailableError(Exception):
    def __init__(self) -> None:
        super().__init__("PREFERRED_UNAVAILABLE")


class SlotTakenError(Exception):
    def __init__(self) -> None:
        super().__init__("UNAVAILABLE")


class NotesContactError(Exception):
    def __init__(self) -> None:
        super().__init__("NOTES_CONTACT")


class FeeError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


class AppointmentError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


class WorkspaceError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def is_unique_constraint(error: BaseException, column: str | None = None) -> bool:
    if not isinstance(error, IntegrityError):
        return False
    text = str(getattr(error, "orig", error)).lower()
    if "unique" not in text and "duplicate" not in text:
        return False
    if not column:
        return True
    needle = column.lower().replace("_", "")
    return needle in text.replace("_", "").replace('"', "").replace("`", "")
