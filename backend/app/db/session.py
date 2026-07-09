from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _engine_kwargs() -> dict[str, object]:
    if settings.database_url.startswith("sqlite"):
        if settings.database_url.startswith("sqlite:///"):
            db_path = settings.database_url.replace("sqlite:///", "", 1)
            if db_path and db_path != ":memory:":
                Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True}


engine = create_engine(settings.database_url, **_engine_kwargs())


@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection: object, connection_record: object) -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
