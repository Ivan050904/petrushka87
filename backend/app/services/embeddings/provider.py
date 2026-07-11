from __future__ import annotations

import hashlib
import math
from collections.abc import Iterable

import httpx

from app.core.config import settings
from app.core.token_sources import is_github_token, read_desktop_token

EMBEDDING_DIM = 256
GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference"
OPENAI_BASE_URL = "https://api.openai.com/v1"


def _tokenize(text: str) -> list[str]:
    return [token for token in text.lower().split() if token]


def hash_embedding(text: str, *, dim: int = EMBEDDING_DIM) -> list[float]:
    vector = [0.0] * dim
    tokens = _tokenize(text)
    if not tokens:
        return vector

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 0:
        return vector
    return [value / norm for value in vector]


def cosine_similarity(left: Iterable[float], right: Iterable[float]) -> float:
    left_list = list(left)
    right_list = list(right)
    if not left_list or not right_list or len(left_list) != len(right_list):
        return 0.0
    return sum(a * b for a, b in zip(left_list, right_list, strict=True))


def _resolve_api_config() -> tuple[str, str, str, str] | None:
    api_key = settings.context_embeddings_api_key.strip()
    if not api_key:
        api_key = settings.notes_ai_api_key.strip()
    if not api_key:
        api_key = settings.openai_compatible_api_key.strip()
    if not api_key:
        api_key = read_desktop_token()
    if not api_key:
        return None

    provider = settings.context_embeddings_provider.strip().lower()
    if not provider or provider == "auto":
        provider = "github" if is_github_token(api_key) else "openai"

    base_url = settings.context_embeddings_base_url.strip()
    if not base_url:
        base_url = GITHUB_MODELS_BASE_URL if provider == "github" else OPENAI_BASE_URL

    model = settings.context_embeddings_model.strip() or "text-embedding-3-small"
    return provider, api_key, base_url.rstrip("/"), model


def get_embedding_provider_name() -> str:
    if not settings.context_embeddings_enabled:
        return "hash"
    if _resolve_api_config() is None:
        return "hash"
    provider = settings.context_embeddings_provider.strip().lower()
    if provider in {"", "auto"}:
        config = _resolve_api_config()
        return config[0] if config else "hash"
    return provider


def embed_texts(texts: list[str]) -> tuple[list[list[float]], str]:
    if not texts:
        return [], "hash"

    if not settings.context_embeddings_enabled:
        return [hash_embedding(text) for text in texts], "hash"

    config = _resolve_api_config()
    if config is None or settings.context_embeddings_provider.strip().lower() == "hash":
        return [hash_embedding(text) for text in texts], "hash"

    provider, api_key, base_url, model = config
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "github":
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    try:
        response = httpx.post(
            f"{base_url}/embeddings",
            headers=headers,
            json={"model": model, "input": texts},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return [hash_embedding(text) for text in texts], "hash"

    data = payload.get("data")
    if not isinstance(data, list):
        return [hash_embedding(text) for text in texts], "hash"

    vectors: list[list[float]] = []
    for item in sorted(data, key=lambda row: row.get("index", 0)):
        embedding = item.get("embedding")
        if isinstance(embedding, list):
            vectors.append([float(value) for value in embedding])
    if len(vectors) != len(texts):
        return [hash_embedding(text) for text in texts], "hash"
    return vectors, provider


def embed_text(text: str) -> tuple[list[float], str]:
    vectors, provider = embed_texts([text])
    if not vectors:
        return hash_embedding(text), "hash"
    return vectors[0], provider
