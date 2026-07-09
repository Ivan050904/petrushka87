from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.demo_seed import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    MIN_DEMO_ENTRIES,
    run_demo_seed,
)


@pytest.fixture()
def seeded_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = tmp_path / "demo-seed.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    monkeypatch.setattr("app.services.demo_seed.SessionLocal", testing_session)
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_demo_seed_creates_user_and_entries(seeded_client: TestClient) -> None:
    first = run_demo_seed()
    assert first.skipped is False
    assert first.entries_created >= MIN_DEMO_ENTRIES
    assert first.entries_total >= MIN_DEMO_ENTRIES

    second = run_demo_seed()
    assert second.skipped is True
    assert second.entries_created == 0
    assert second.entries_total == first.entries_total

    login = seeded_client.post(
        "/api/v1/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )
    assert login.status_code == 200

    entries = seeded_client.get(
        "/api/v1/entries",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        params={"limit": 100},
    )
    assert entries.status_code == 200
    body = entries.json()
    assert body["total"] >= MIN_DEMO_ENTRIES

    for entry_type in (
        "task",
        "event",
        "finance",
        "habit",
        "food",
        "person",
        "diary",
        "note",
        "resource",
        "reminder",
    ):
        typed = seeded_client.get(
            "/api/v1/entries",
            headers={"Authorization": f"Bearer {login.json()['access_token']}"},
            params={"type": entry_type, "limit": 1},
        )
        assert typed.status_code == 200
        assert typed.json()["total"] >= 1, entry_type


def test_demo_seed_reset_recreates_entries(seeded_client: TestClient) -> None:
    run_demo_seed()
    reset = run_demo_seed(reset=True)
    assert reset.skipped is False
    assert reset.entries_created >= MIN_DEMO_ENTRIES
    assert reset.entries_total >= MIN_DEMO_ENTRIES
