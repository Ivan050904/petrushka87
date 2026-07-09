from collections.abc import Generator

from app.db.base import Base
from app.db.session import SessionLocal, engine, get_db

__all__ = ["Base", "SessionLocal", "engine", "get_db", "init_db"]


def init_db() -> None:
    """Schema is managed by Alembic in the main application database."""
