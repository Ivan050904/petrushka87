from __future__ import annotations

from collections.abc import Generator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import workout  # noqa: F401


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


from tests.auth_helpers import create_user_token as _register


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_workout_catalog_and_session_flow(client: TestClient) -> None:
    token = _register(
        client,
        email="gym@example.com",
        password="password12345",
        full_name="Gym User",
    )
    headers = _auth(token)

    create_resp = client.post(
        "/api/v1/workouts/catalog",
        headers=headers,
        json={"name": "Жим лёжа", "muscle_group": "chest"},
    )
    assert create_resp.status_code == 201
    catalog_id = create_resp.json()["id"]

    duplicate_resp = client.post(
        "/api/v1/workouts/catalog",
        headers=headers,
        json={"name": "Жим лёжа", "muscle_group": "back"},
    )
    assert duplicate_resp.status_code == 201

    session_resp = client.post(
        "/api/v1/workouts/sessions",
        headers=headers,
        json={
            "body_weight": 80,
            "mood": 7,
            "muscle_readiness": 8,
            "sleep_quality": 6,
            "general_fatigue": 4,
            "exercises": [
                {
                    "exercise_catalog_id": catalog_id,
                    "sets": [
                        {"weight": 60, "reps": 10},
                        {"weight": 70, "reps": 8},
                    ],
                }
            ],
        },
    )
    assert session_resp.status_code == 201
    session_id = session_resp.json()["id"]
    assert len(session_resp.json()["exercises"]) == 1

    analytics_resp = client.get(f"/api/v1/workouts/analytics/exercise/{catalog_id}", headers=headers)
    assert analytics_resp.status_code == 200
    points = analytics_resp.json()
    assert len(points) == 1
    assert points[0]["max_weight"] == 70

    group_resp = client.get("/api/v1/workouts/analytics/muscle-group/chest", headers=headers)
    assert group_resp.status_code == 200
    assert group_resp.json()[0]["max_weight"] == 70

    record_resp = client.post(
        "/api/v1/workouts/records",
        headers=headers,
        json={
            "exercise_catalog_id": catalog_id,
            "weight": 100,
            "reps": 5,
            "date": date.today().isoformat(),
        },
    )
    assert record_resp.status_code == 201

    list_resp = client.get("/api/v1/workouts/sessions", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    delete_resp = client.delete(f"/api/v1/workouts/sessions/{session_id}", headers=headers)
    assert delete_resp.status_code == 204
