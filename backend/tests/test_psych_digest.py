from __future__ import annotations

import uuid
from collections.abc import Generator
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import entries as entry_routes
from app.api.routes import resources
from app.core.config import settings as app_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.entry import Entry
from app.models.user import User
from app.services.agent.article_feedback import (
    FeedbackExample,
    FeedbackProfile,
    load_feedback_profile,
)
from app.services.agent.digest import run_daily_digest
from app.services.agent.digest_profiles import collect_psychology_candidates
from app.services.agent.psych_queries import (
    PSYCH_QUERY_BLOCKS,
    configured_psych_queries,
    select_rotated_psych_queries,
)
from app.services.agent.psych_query_tuner import tune_psych_queries
from app.services.agent.psych_relevance import (
    filter_psych_candidates,
    is_psych_relevant,
    is_safe_psych_search_query,
)
from app.services.agent.tools.article_validator import filter_reachable_articles
from app.services.agent.tools.web_search import SearchResult
from app.storage.local import LocalFileStorage
from tests.auth_helpers import create_user_in_db, create_user_token, open_test_db


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
    monkeypatch.setattr(entry_routes, "index_entry", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "app.services.agent.scheduler.settings",
        replace(app_settings, digest_scheduler_enabled=False),
    )
    resources.storage = LocalFileStorage(tmp_path / "files")

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        resources.storage = original_storage
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def test_select_rotated_psych_queries_one_per_block() -> None:
    selections = select_rotated_psych_queries()
    assert len(selections) == len(PSYCH_QUERY_BLOCKS)
    tiers = {item.tier for item in selections}
    assert tiers == set(PSYCH_QUERY_BLOCKS.keys())
    for item in selections:
        assert item.query in PSYCH_QUERY_BLOCKS[item.tier]


@patch("app.services.agent.psych_queries.load_digest_state")
def test_configured_psych_queries_uses_tuned_queries(mock_load_state: MagicMock) -> None:
    mock_load_state.return_value = MagicMock(
        tuned_queries=[
            "tuned guides query",
            "tuned popsci query",
            "tuned science query",
        ],
        tuned_at=datetime.now(UTC).isoformat(),
    )
    selections = configured_psych_queries(uuid.uuid4())
    assert [item.query for item in selections] == [
        "tuned guides query",
        "tuned popsci query",
        "tuned science query",
    ]


def test_is_psych_relevant_rejects_ecommerce_spam() -> None:
    assert not is_psych_relevant(
        SearchResult(
            title="High Profit Margin Products: What To Sell in 2026 - Shopify",
            url="https://www.shopify.com/blog/high-profit-margin-products",
            snippet="Find the best e-commerce categories for profit margins.",
            query="CBT interpersonal effectiveness skills filetype:pdf",
        )
    )


def test_is_psych_relevant_accepts_psychology_sources() -> None:
    assert is_psych_relevant(
        SearchResult(
            title="Cognitive behavioural therapy",
            url="https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/cognitive-behavioural-therapy-cbt/",
            snippet="CBT can help you manage problems by changing how you think and behave.",
            query='"cognitive behavioural therapy" site:nhs.uk',
        )
    )


def test_is_psych_relevant_rejects_unapproved_source() -> None:
    assert not is_psych_relevant(
        SearchResult(
            title="Cognitive distortions explained",
            url="https://example.com/cognitive-distortions",
            snippet="CBT and cognitive distortions.",
            query="cognitive distortions",
        )
    )


def test_safe_psych_query_requires_topic_and_allowed_site() -> None:
    assert is_safe_psych_search_query('"thought record" CBT site:cci.health.wa.gov.au')
    assert not is_safe_psych_search_query("CBT thought record")
    assert not is_safe_psych_search_query("CBT thought record site:example.com")
    assert not is_safe_psych_search_query("profit margins site:nhs.uk")


@patch("app.services.agent.tools.article_validator.is_reachable_article_url")
def test_filter_reachable_articles_removes_unavailable_urls(mock_reachable: MagicMock) -> None:
    mock_reachable.side_effect = [True, False]
    candidates = [
        SearchResult(title="CBT", url="https://www.nhs.uk/cbt", snippet="CBT", query="CBT site:nhs.uk"),
        SearchResult(
            title="Schemas",
            url="https://www.nhs.uk/schema",
            snippet="schema therapy",
            query="schema site:nhs.uk",
        ),
    ]
    assert [item.title for item in filter_reachable_articles(candidates)] == ["CBT"]


def test_filter_psych_candidates_removes_junk() -> None:
    candidates = [
        SearchResult(
            title="High Profit Margin Products",
            url="https://www.shopify.com/blog/profit",
            snippet="e-commerce profit",
            query="q1",
        ),
        SearchResult(
            title="Thought Record CBT Worksheet",
            url="https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself/Depression",
            snippet="A CBT thought record helps identify cognitive distortions.",
            query="q2",
        ),
    ]
    filtered = filter_psych_candidates(candidates)
    assert len(filtered) == 1
    assert filtered[0].title.startswith("Thought Record")


@patch("app.services.agent.digest_profiles.filter_reachable_articles")
@patch("app.services.agent.digest_profiles.web_search")
def test_collect_psychology_candidates_filters_irrelevant_results(
    mock_web_search: MagicMock,
    mock_reachable: MagicMock,
) -> None:
    mock_web_search.return_value = [
        SearchResult(
            title="High Profit Margin Products: What To Sell in 2026 - Shopify",
            url="https://www.shopify.com/blog/profit",
            snippet="e-commerce profit margin guide",
            query="CBT interpersonal effectiveness skills filetype:pdf",
        ),
        SearchResult(
            title="Interpersonal Effectiveness Skills",
            url="https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself/Assertiveness",
            snippet="CBT relationship skills and interpersonal effectiveness in therapy.",
            query="CBT relationships site:cci.health.wa.gov.au",
        ),
    ]
    mock_reachable.side_effect = lambda items: list(items)
    candidates, _tier_by_query = collect_psychology_candidates(
        ["CBT relationships site:cci.health.wa.gov.au"],
        user_id=uuid.uuid4(),
    )
    assert len(candidates) == 1
    assert "cci.health.wa.gov.au" in candidates[0].url


@patch("app.services.agent.digest_profiles.filter_reachable_articles")
@patch("app.services.agent.digest_profiles.web_search")
def test_collect_psychology_candidates_without_habr_lock(
    mock_web_search: MagicMock,
    mock_reachable: MagicMock,
) -> None:
    mock_web_search.return_value = [
        SearchResult(
            title="Cognitive distortions",
            url="https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself/Depression",
            snippet="Common thinking traps",
            query='"cognitive distortions" workbook site:cci.health.wa.gov.au',
            source_site="cci.health.wa.gov.au",
        )
    ]
    mock_reachable.side_effect = lambda items: list(items)
    candidates, tier_by_query = collect_psychology_candidates(
        ['"cognitive distortions" workbook site:cci.health.wa.gov.au'],
        user_id=uuid.uuid4(),
    )
    assert len(candidates) == 1
    assert candidates[0].source_site == "cci.health.wa.gov.au"
    assert tier_by_query['"cognitive distortions" workbook site:cci.health.wa.gov.au'] == "custom"
    mock_web_search.assert_called_once()
    assert "site:habr.com" not in mock_web_search.call_args.args[0]


@patch("app.services.agent.digest_profiles.filter_reachable_articles")
@patch("app.services.agent.digest_profiles.web_search")
def test_run_psych_digest_saves_en_articles_directly(
    mock_web_search: MagicMock,
    mock_reachable: MagicMock,
    client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    state_dir = tmp_path / "logs" / "digest_state"
    state_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("app.services.agent.state._state_path", lambda user_id: state_dir / f"{user_id}.json")
    monkeypatch.setattr(
        "app.services.agent.digest.settings",
        replace(app_settings, psych_digest_enabled=True, psych_digest_use_llm_filter=False),
    )

    with open_test_db() as db:
        user = create_user_in_db(
            db,
            email="psych@test.local",
            password="secret12345",
            full_name="Psych User",
        )
        user_id = user.id

    mock_web_search.return_value = [
        SearchResult(
            title="Cognitive behavioural therapy",
            url="https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/cognitive-behavioural-therapy-cbt/",
            snippet="How approval seeking works",
            query='"cognitive behavioural therapy" site:nhs.uk',
            source_site="nhs.uk",
        )
    ]
    mock_reachable.side_effect = lambda items: list(items)

    db = next(app.dependency_overrides[get_db]())
    try:
        result = run_daily_digest(
            db,
            user_id=user_id,
            profile="psychology",
            force=True,
            skip_health_check=True,
        )
        assert result.status == "ok"
        assert result.articles_saved == 1

        entry = db.query(Entry).filter(Entry.user_id == user_id).one()
        assert entry.title == "Cognitive behavioural therapy"
        assert entry.content == "How approval seeking works"
        assert entry.metadata_["collection"] == "psychology"
        assert entry.metadata_["source"] == "psych_digest"
        assert entry.metadata_["source_language"] == "en"
        assert entry.metadata_["snippet_en"] == "How approval seeking works"
        assert entry.metadata_["article_access_checked"] is True
        assert "summary_ru" not in entry.metadata_
    finally:
        db.close()


@patch("app.api.routes.agent.run_daily_digest")
def test_digest_run_endpoint_psychology_profile(mock_run_digest, client: TestClient) -> None:
    from app.services.agent.digest import DigestResult

    token = create_user_token(
        client,
        email="psych-run@test.local",
        password="secret12345",
        full_name="Psych Run",
    )
    headers = {"Authorization": f"Bearer {token}"}

    mock_run_digest.return_value = DigestResult(
        status="ok",
        articles_saved=3,
        articles_skipped=0,
        topics=["query1", "query2", "query3"],
        message="Saved 3 articles, skipped 0",
        profile="psychology",
    )

    response = client.post(
        "/api/v1/agent/digest/run",
        headers=headers,
        json={"force": True, "profile": "psychology"},
    )
    assert response.status_code == 200
    assert mock_run_digest.call_args.kwargs["profile"] == "psychology"
    assert response.json()["profile"] == "psychology"


def test_digest_status_includes_psychology_section(client: TestClient) -> None:
    token = create_user_token(
        client,
        email="psych-status@test.local",
        password="secret12345",
        full_name="Psych Status",
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/v1/agent/digest/status", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "psychology" in body
    assert body["psychology"]["enabled"] is True
    assert "next_search_from" in body["psychology"]
    assert "query_source" in body["psychology"]


def test_load_feedback_profile_filters_by_collection(client: TestClient) -> None:
    token = create_user_token(
        client,
        email="feedback-coll@test.local",
        password="secret12345",
        full_name="Feedback Coll",
    )
    headers = {"Authorization": f"Bearer {token}"}

    ai_article = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "resource",
            "title": "AI article",
            "content": "Summary",
            "metadata": {
                "kind": "article",
                "collection": "ai",
                "url": "https://habr.com/ru/articles/ai/",
                "source": "daily_digest",
            },
        },
    )
    assert ai_article.status_code == 201

    psych_article = client.post(
        "/api/v1/entries",
        headers=headers,
        json={
            "type": "resource",
            "title": "Psych article",
            "content": "Summary",
            "metadata": {
                "kind": "article",
                "collection": "psychology",
                "url": "https://psychologytoday.com/example",
                "source": "psych_digest",
            },
        },
    )
    assert psych_article.status_code == 201

    client.post(
        "/api/v1/agent/digest/feedback",
        headers=headers,
        json={"entry_id": ai_article.json()["id"], "feedback": "dislike"},
    )
    client.post(
        "/api/v1/agent/digest/feedback",
        headers=headers,
        json={"entry_id": psych_article.json()["id"], "feedback": "off_topic"},
    )

    db = next(app.dependency_overrides[get_db]())
    try:
        user = db.query(User).filter(User.email == "feedback-coll@test.local").one()
        ai_profile = load_feedback_profile(db, user.id, collection="ai")
        psych_profile = load_feedback_profile(db, user.id, collection="psychology")
        assert len(ai_profile.examples) == 1
        assert ai_profile.examples[0].title == "AI article"
        assert len(psych_profile.examples) == 1
        assert psych_profile.examples[0].title == "Psych article"
    finally:
        db.close()


@patch("app.services.agent.psych_query_tuner.DigestLLMClient")
@patch("app.services.agent.psych_query_tuner.check_ollama_health", return_value=True)
def test_tune_psych_queries_saves_tuned_queries(
    _mock_health: MagicMock,
    mock_llm_cls: MagicMock,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user_id = uuid.uuid4()
    state_path = tmp_path / "digest_state" / f"{user_id}.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("app.services.agent.state._state_path", lambda uid: state_path)

    mock_llm = MagicMock()
    mock_llm.is_configured.return_value = True
    mock_llm.complete_json.return_value = {
        "queries": [
            {"tier": "guides", "query": "CBT thought record site:cci.health.wa.gov.au"},
            {"tier": "popsci", "query": "self esteem site:mind.org.uk"},
            {"tier": "science", "query": "schema therapy site:pmc.ncbi.nlm.nih.gov"},
        ]
    }
    mock_llm_cls.return_value = mock_llm

    profile = FeedbackProfile(
        examples=[
            FeedbackExample(
                title="Bad article",
                summary="Not useful",
                url="https://example.com/bad",
                query="bad query",
                feedback="off_topic",
            )
            for _ in range(3)
        ]
    )
    result = tune_psych_queries(profile, user_id=user_id)
    assert result.status == "ok"
    assert len(result.queries) == 3

    selections = configured_psych_queries(user_id)
    assert [item.query for item in selections] == result.queries


@patch("app.services.agent.psych_query_tuner.DigestLLMClient")
@patch("app.services.agent.psych_query_tuner.check_ollama_health", return_value=True)
def test_tune_psych_queries_rejects_unapproved_llm_sources(
    _mock_health: MagicMock,
    mock_llm_cls: MagicMock,
) -> None:
    mock_llm = MagicMock()
    mock_llm.is_configured.return_value = True
    mock_llm.complete_json.return_value = {
        "queries": [
            {"tier": "guides", "query": "CBT worksheet site:example.com"},
            {"tier": "popsci", "query": "self esteem site:mind.org.uk"},
            {"tier": "science", "query": "schema therapy site:pmc.ncbi.nlm.nih.gov"},
        ]
    }
    mock_llm_cls.return_value = mock_llm
    profile = FeedbackProfile(
        examples=[
            FeedbackExample(
                title="Rejected",
                summary="Not useful",
                url="https://example.com/rejected",
                query="old",
                feedback="off_topic",
            )
            for _ in range(3)
        ]
    )

    result = tune_psych_queries(profile, user_id=uuid.uuid4())
    assert result.status == "error"
    assert not result.queries


@patch("app.services.agent.scheduler.run_daily_digest")
@patch("app.services.agent.scheduler.tune_psych_queries")
@patch("app.services.agent.scheduler.tune_ai_queries")
def test_scheduler_runs_both_profiles_and_tunes(
    mock_tune_ai: MagicMock,
    mock_tune_psych: MagicMock,
    mock_run_digest: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    from app.services.agent import scheduler

    mock_tune_ai.return_value = MagicMock(status="skipped", message="not enough feedback")
    mock_tune_psych.return_value = MagicMock(status="skipped", message="not enough feedback")

    monkeypatch.setattr(
        scheduler,
        "settings",
        replace(
            app_settings,
            digest_scheduler_enabled=True,
            digest_enabled=True,
            psych_digest_enabled=True,
        ),
    )
    monkeypatch.setattr(scheduler, "SessionLocal", MagicMock())

    async def run_once() -> None:
        scheduler._last_scheduled_run_date = None
        await scheduler._run_scheduled_digest()

    asyncio.run(run_once())

    mock_tune_ai.assert_called_once()
    mock_tune_psych.assert_called_once()
    assert mock_run_digest.call_count == 2
    profiles = [call.kwargs.get("profile") for call in mock_run_digest.call_args_list]
    assert profiles == ["ai", "psychology"]


def test_psych_tune_queries_endpoint(client: TestClient) -> None:
    token = create_user_token(
        client,
        email="psych-tune@test.local",
        password="secret12345",
        full_name="Psych Tune",
    )
    headers = {"Authorization": f"Bearer {token}"}

    with patch("app.api.routes.agent.tune_psych_queries") as mock_tune:
        mock_tune.return_value = MagicMock(
            status="skipped",
            queries=[],
            message="Need at least 3 rejected articles before tuning queries",
            source="static",
        )
        response = client.post("/api/v1/agent/digest/psychology/tune-queries", headers=headers)
        assert response.status_code == 200
        assert response.json()["status"] == "skipped"
