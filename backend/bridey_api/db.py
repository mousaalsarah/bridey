from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from bridey_api.config import is_lambda, sqlalchemy_database_url

engine: Engine | None = None
SessionLocal: sessionmaker[Session] | None = None


def init_engine(url: str | None = None) -> Engine | None:
    global engine, SessionLocal
    resolved = sqlalchemy_database_url(url)
    if not resolved:
        engine = None
        SessionLocal = None
        return None

    kwargs: dict = {"future": True, "pool_pre_ping": True}
    if resolved.startswith("sqlite:"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in resolved:
            kwargs["poolclass"] = StaticPool
    elif is_lambda():
        kwargs["poolclass"] = NullPool

    engine = create_engine(resolved, **kwargs)
    if resolved.startswith("sqlite:"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=8000")
            cursor.close()

    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return engine


def get_session() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def ping() -> bool:
    if engine is None:
        return False
    with engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")
    return True
