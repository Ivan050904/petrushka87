from __future__ import annotations

from dataclasses import replace

import pytest

from app.core.config import settings as app_settings
from app.services.context.query_intent import route_query


@pytest.fixture(autouse=True)
def enable_multi_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.context.query_intent.settings",
        replace(app_settings, context_router_multi_scope=True, context_date_lookup_enabled=True),
    )


def test_route_query_notes_by_diary_keyword() -> None:
    intent = route_query("что было в дневнике за 4 июля 2026")
    assert "notes" in intent.scopes
    assert intent.matched_dates == ["2026-07-04"]
    assert intent.confidence >= 0.8


def test_route_query_finance_month() -> None:
    intent = route_query("расходы за май 2026")
    assert "finance" in intent.scopes
    assert intent.finance_month == "2026-05"


def test_route_query_kanban_scope() -> None:
    intent = route_query("что на канбан доске")
    assert intent.scopes == ["kanban"]


def test_route_query_cross_module_week_summary() -> None:
    intent = route_query("сводка за прошлую неделю")
    assert "notes" in intent.scopes
    assert "plans" in intent.scopes
    assert "finance" in intent.scopes
    assert intent.date_range is not None


def test_route_query_fallback_all() -> None:
    intent = route_query("привет")
    assert intent.scopes == ["all"]
    assert intent.confidence <= 0.4
