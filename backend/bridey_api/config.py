from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
PRISMA_DIR = REPO_ROOT / "prisma"

WEAK_SECRETS = {"", "change-me-to-a-long-random-string", "bridey-dev-secret"}


def load_env() -> None:
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(REPO_ROOT / ".env")


def is_lambda() -> bool:
    return bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or os.environ.get("AWS_EXECUTION_ENV"))


def is_deployed_runtime() -> bool:
    if is_lambda() or os.environ.get("VERCEL") == "1":
        return True
    url = os.environ.get("DATABASE_URL") or ""
    return url.startswith("postgres://") or url.startswith("postgresql://")


def auth_secret_value() -> str:
    value = os.environ.get("AUTH_SECRET") or ""
    if is_deployed_runtime() and value in WEAK_SECRETS:
        raise RuntimeError("AUTH_SECRET must be set to a long random string in production")
    return value or "bridey-dev-secret"


def admin_secret_value() -> str:
    return f"{auth_secret_value()}-admin"


def sqlalchemy_database_url(raw: str | None = None) -> str | None:
    url = (raw if raw is not None else os.environ.get("DATABASE_URL") or "").strip().strip('"')
    if not url:
        return None
    if url.startswith("file:"):
        rel = url.removeprefix("file:")
        path = Path(rel)
        if not path.is_absolute():
            path = (PRISMA_DIR / rel).resolve()
        return "sqlite:///" + path.as_posix()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url
