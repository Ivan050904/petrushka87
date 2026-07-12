from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from tests.auth_helpers import create_user_token


@pytest.fixture()
def client(tmp_path: Path) -> Generator[TestClient, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_register_is_disabled(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "blocked@example.com",
            "password": "password12345",
            "full_name": "Blocked User",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Registration disabled"


def test_login_rate_limit(client: TestClient) -> None:
    create_user_token(
        client,
        email="ratelimit@example.com",
        password="password12345",
        full_name="Rate Limit User",
    )

    payload = {"email": "ratelimit@example.com", "password": "wrong-password"}
    statuses = [
        client.post("/api/v1/auth/login", json=payload).status_code
        for _ in range(6)
    ]
    assert 429 in statuses
    assert all(status in {401, 429} for status in statuses)


def test_create_user_script_flow(client: TestClient) -> None:
    token = create_user_token(
        client,
        email="script-user@example.com",
        password="password12345",
        full_name="Script User",
    )
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == "script-user@example.com"
