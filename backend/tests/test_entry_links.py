from __future__ import annotations

import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import entries as entry_routes
from app.api.routes import resources
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.storage.local import LocalFileStorage


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'test.db'}",
        connect_args={"check_same_thread": False},
    )
    _enable_foreign_keys(engine)
    Base.metadata.create_all(bind=engine)

    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    original_storage = resources.storage
    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(entry_routes, "get_ai_client", lambda: None)
    resources.storage = LocalFileStorage(tmp_path / "files")

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        resources.storage = original_storage
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def _enable_foreign_keys(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection: object, connection_record: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


from tests.auth_helpers import create_user_token as _register


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_entry(client: TestClient, headers: dict[str, str], content: str) -> str:
    response = client.post(
        "/api/v1/entries",
        headers=headers,
        json={"type": "note", "content": content},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_entry_links_crud(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    source_id = _create_entry(client, headers, "Parent note")
    target_id = _create_entry(client, headers, "Related note")

    empty = client.get(f"/api/v1/entries/{source_id}/links", headers=headers)
    assert empty.status_code == 200
    assert empty.json() == []

    created = client.post(
        f"/api/v1/entries/{source_id}/links",
        headers=headers,
        json={"target_entry_id": target_id, "link_type": "relates_to"},
    )
    assert created.status_code == 201
    link = created.json()
    assert link["source_entry_id"] == source_id
    assert link["target_entry_id"] == target_id
    assert link["link_type"] == "relates_to"

    listed = client.get(f"/api/v1/entries/{source_id}/links", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == link["id"]

    deleted = client.delete(
        f"/api/v1/entries/{source_id}/links/{link['id']}",
        headers=headers,
    )
    assert deleted.status_code == 204

    after_delete = client.get(f"/api/v1/entries/{source_id}/links", headers=headers)
    assert after_delete.status_code == 200
    assert after_delete.json() == []


def test_entry_link_rejects_invalid_type(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)
    source_id = _create_entry(client, headers, "One")
    target_id = _create_entry(client, headers, "Two")

    response = client.post(
        f"/api/v1/entries/{source_id}/links",
        headers=headers,
        json={"target_entry_id": target_id, "link_type": "invalid"},
    )
    assert response.status_code == 422


def test_entry_link_rejects_self_link(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)
    entry_id = _create_entry(client, headers, "Solo")

    response = client.post(
        f"/api/v1/entries/{entry_id}/links",
        headers=headers,
        json={"target_entry_id": entry_id, "link_type": "relates_to"},
    )
    assert response.status_code == 422
