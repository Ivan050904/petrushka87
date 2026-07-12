from __future__ import annotations

import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import entries as entry_routes
from app.api.routes import finance as finance_routes
from app.api.routes import resources
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.finance.ai_config import FinanceAIConfig
from app.services.finance.models import ParsedTransaction
from app.storage.local import LocalFileStorage


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
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


from tests.auth_helpers import create_user_token as _register


def test_finance_categorize_uses_mock(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    token = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    monkeypatch.setattr(
        finance_routes,
        "resolve_finance_ai_config",
        lambda: FinanceAIConfig(
            provider="test",
            model="mock",
            base_url="http://test",
            api_key="key",
            ready=True,
            message="ok",
        ),
    )

    def fake_categorize(transactions, *, categories=None, accounts=None):
        del categories, accounts
        return [
            ParsedTransaction(
                transaction_date=item.transaction_date,
                amount=item.amount,
                direction=item.direction,
                description=item.description,
                category="Продукты",
                kind="expense",
            )
            for item in transactions
        ]

    monkeypatch.setattr(finance_routes, "categorize_transactions", fake_categorize)

    response = client.post(
        "/api/v1/finance/categorize",
        headers=headers,
        json={
            "rows": [
                {
                    "transaction_date": "2026-07-05",
                    "amount": 1500,
                    "direction": "expense",
                    "description": "Магазин",
                    "currency": "RUB",
                }
            ],
            "categories": ["Продукты", "Прочее"],
            "accounts": [],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["rows"][0]["category"] == "Продукты"
    assert body["rows"][0]["kind"] == "expense"
