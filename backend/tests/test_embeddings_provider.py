from __future__ import annotations

from dataclasses import replace

import httpx
import pytest

from app.core.config import settings as app_settings
from app.services.embeddings.provider import embed_text, embed_texts, get_embedding_provider_name, hash_embedding


def test_hash_embedding_dimensions() -> None:
    vector = hash_embedding("hello world")
    assert len(vector) == 256
    assert any(value != 0 for value in vector)


def test_embed_texts_hash_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.embeddings.provider.settings",
        replace(app_settings, context_embeddings_enabled=False),
    )
    vectors, provider = embed_texts(["alpha", "beta"])
    assert provider == "hash"
    assert len(vectors) == 2


def test_get_embedding_provider_name_hash_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.embeddings.provider.settings",
        replace(
            app_settings,
            context_embeddings_enabled=True,
            context_embeddings_api_key="",
            notes_ai_api_key="",
            openai_compatible_api_key="",
        ),
    )
    monkeypatch.setattr("app.services.embeddings.provider.read_desktop_token", lambda: "")
    assert get_embedding_provider_name() == "hash"


def test_embed_texts_http_error_falls_back_to_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeResponse:
        def raise_for_status(self) -> None:
            raise httpx.HTTPStatusError(
                "429 Too Many Requests",
                request=httpx.Request("POST", "https://example.com/embeddings"),
                response=httpx.Response(429),
            )

    monkeypatch.setattr(
        "app.services.embeddings.provider.settings",
        replace(
            app_settings,
            context_embeddings_enabled=True,
            context_embeddings_provider="github",
            context_embeddings_api_key="test-key",
            context_embeddings_base_url="https://example.com/v1",
        ),
    )
    monkeypatch.setattr(
        "app.services.embeddings.provider._resolve_api_config",
        lambda: ("github", "test-key", "https://example.com/v1", "text-embedding-3-small"),
    )
    monkeypatch.setattr("app.services.embeddings.provider.httpx.post", lambda *args, **kwargs: FakeResponse())

    vectors, provider = embed_texts(["alpha"])
    assert provider == "hash"
    assert len(vectors) == 1
    assert len(vectors[0]) == 256


def test_embed_text_returns_vector(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.embeddings.provider.settings",
        replace(app_settings, context_embeddings_enabled=False),
    )
    vector, provider = embed_text("sample")
    assert provider == "hash"
    assert len(vector) > 0
