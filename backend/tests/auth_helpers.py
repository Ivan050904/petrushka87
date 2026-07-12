from __future__ import annotations

import uuid
from collections.abc import Generator
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.services.users import create_user


@contextmanager
def open_test_db() -> Generator[Session, None, None]:
    override = app.dependency_overrides.get(get_db)
    if override is None:
        raise RuntimeError("get_db is not overridden in tests")
    generator = override()
    db = next(generator)
    try:
        yield db
    finally:
        db.close()
        generator.close()


def create_user_in_db(
    db: Session,
    *,
    email: str | None = None,
    password: str = "password123",
    full_name: str = "Test User",
) -> User:
    return create_user(
        db,
        email=email or f"user-{uuid.uuid4().hex[:8]}@example.com",
        password=password,
        full_name=full_name,
    )


def create_user_token(
    client: TestClient,
    *,
    email: str | None = None,
    password: str = "password123",
    full_name: str = "Test User",
) -> str:
    with open_test_db() as db:
        user = create_user_in_db(db, email=email, password=password, full_name=full_name)

    login = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": password},
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]
