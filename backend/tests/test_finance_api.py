from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
import uuid

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


def test_finance_summary_splits_expense_and_income_categories(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    confirm = client.post(
        "/api/v1/finance/import/confirm",
        headers=headers,
        json={
            "bank": "sber",
            "account_id": "acc-1",
            "parser": "test",
            "rows": [
                {
                    "transaction_date": "2026-07-05",
                    "amount": 1500,
                    "direction": "expense",
                    "description": "Магазин",
                    "title": "Продукты неделя",
                    "currency": "RUB",
                    "kind": "expense",
                    "category": "Продукты",
                },
                {
                    "transaction_date": "2026-07-10",
                    "amount": 50000,
                    "direction": "income",
                    "description": "Зарплата",
                    "currency": "RUB",
                    "kind": "income",
                    "category": "Зарплата",
                },
                {
                    "transaction_date": "2026-07-12",
                    "amount": 3000,
                    "direction": "expense",
                    "description": "Перевод себе",
                    "currency": "RUB",
                    "kind": "transfer",
                },
            ],
        },
    )
    assert confirm.status_code == 200
    created = confirm.json()
    assert created["created"] == 3

    summary = client.get(
        "/api/v1/finance/summary",
        headers=headers,
        params={"from": "2026-07-01", "to": "2026-07-31"},
    )
    assert summary.status_code == 200
    body = summary.json()
    assert body["expense"] == 1500
    assert body["income"] == 50000
    assert body["balance"] == 48500
    assert body["transfers"] == 1
    assert body["by_expense_category"] == [{"category": "Продукты", "total": 1500}]
    assert body["by_income_category"] == [{"category": "Зарплата", "total": 50000}]
    assert body["by_category"] == body["by_expense_category"]


def test_finance_import_confirm_uses_custom_title_or_description(client: TestClient) -> None:
    token = _register(client)
    headers = _auth_headers(token)

    confirm = client.post(
        "/api/v1/finance/import/confirm",
        headers=headers,
        json={
            "bank": "sber",
            "account_id": "acc-1",
            "parser": "test",
            "rows": [
                {
                    "transaction_date": "2026-07-01",
                    "amount": 100,
                    "direction": "expense",
                    "description": "Банковское описание",
                    "title": "Моё название",
                    "currency": "RUB",
                    "kind": "expense",
                    "category": "Прочее",
                },
                {
                    "transaction_date": "2026-07-02",
                    "amount": 200,
                    "direction": "expense",
                    "description": "Только описание банка",
                    "currency": "RUB",
                    "kind": "expense",
                    "category": "Прочее",
                },
            ],
        },
    )
    assert confirm.status_code == 200

    entries = client.get("/api/v1/entries", headers=headers, params={"type": "finance"})
    assert entries.status_code == 200
    titles = {item["title"] for item in entries.json()["items"]}
    assert "Моё название" in titles
    assert "Только описание банка" in titles


def _register(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"finance-{uuid.uuid4().hex[:8]}@example.com",
            "password": "password123",
            "full_name": "Finance User",
        },
    )
    assert response.status_code == 201

    login = client.post(
        "/api/v1/auth/login",
        json={"email": response.json()["user"]["email"], "password": "password123"},
    )
    assert login.status_code == 200
    return login.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
