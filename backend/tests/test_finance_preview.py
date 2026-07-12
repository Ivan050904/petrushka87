from __future__ import annotations

import uuid
from collections.abc import Generator
from io import BytesIO
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

GENERIC_CSV = (
    "Дата;Сумма;Описание\n"
    "01.07.2026;-1500,00;Магазин\n"
    "02.07.2026;+50000,00;Зарплата\n"
).encode()


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


def test_finance_import_preview_generic_csv(client: TestClient) -> None:
    token = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/api/v1/finance/import/preview",
        headers=headers,
        data={"bank": "generic", "account_id": "acc-test"},
        files={"file": ("statement.csv", BytesIO(GENERIC_CSV), "text/csv")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parser"] == "generic"
    assert body["parser_warning"] is None
    assert len(body["rows"]) == 2
    assert body["rows"][0]["direction"] == "expense"
    assert body["rows"][1]["direction"] == "income"


def test_finance_import_preview_tinkoff_csv_falls_back_with_warning(client: TestClient) -> None:
    token = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/api/v1/finance/import/preview",
        headers=headers,
        data={"bank": "tinkoff", "account_id": "acc-test"},
        files={"file": ("tinkoff.csv", BytesIO(GENERIC_CSV), "text/csv")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parser"] == "generic"
    assert body["parser_warning"] is not None
    assert "Тинькофф" in body["parser_warning"]
    assert len(body["rows"]) == 2
