from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from app.core.config import settings

DigestProfileName = Literal["ai", "psychology"]


def _legacy_state_path() -> Path:
    return Path(__file__).resolve().parents[3] / "storage" / "logs" / "digest_state.json"


def _user_state_dir() -> Path:
    path = Path(__file__).resolve().parents[3] / "storage" / "logs" / "digest_state"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _state_path(user_id: uuid.UUID) -> Path:
    return _user_state_dir() / f"{user_id}.json"


@dataclass
class ProfileDigestState:
    last_run_at: str | None = None
    last_status: str = "idle"
    last_articles_saved: int = 0
    last_error: str | None = None
    last_topics: list[str] | None = None
    last_search_until: str | None = None
    tuned_queries: list[str] | None = None
    tuned_at: str | None = None


@dataclass
class DigestStateStore:
    ai: ProfileDigestState = field(default_factory=ProfileDigestState)
    psychology: ProfileDigestState = field(default_factory=ProfileDigestState)


# Backward compatibility alias
DigestState = ProfileDigestState


def _profile_state_from_raw(raw: dict | None) -> ProfileDigestState:
    base = ProfileDigestState()
    if not raw:
        return base
    return ProfileDigestState(
        last_run_at=raw.get("last_run_at"),
        last_status=raw.get("last_status", "idle"),
        last_articles_saved=int(raw.get("last_articles_saved", 0)),
        last_error=raw.get("last_error"),
        last_topics=raw.get("last_topics"),
        last_search_until=raw.get("last_search_until"),
        tuned_queries=raw.get("tuned_queries"),
        tuned_at=raw.get("tuned_at"),
    )


def _migrate_legacy_state(raw: dict) -> DigestStateStore:
    if "ai" in raw or "psychology" in raw:
        return DigestStateStore(
            ai=_profile_state_from_raw(raw.get("ai")),
            psychology=_profile_state_from_raw(raw.get("psychology")),
        )
    legacy = _profile_state_from_raw(raw)
    return DigestStateStore(ai=legacy)


def _load_store_from_path(path: Path) -> DigestStateStore:
    if not path.exists():
        return DigestStateStore()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return DigestStateStore()
        return _migrate_legacy_state(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return DigestStateStore()


def load_digest_state_store(user_id: uuid.UUID) -> DigestStateStore:
    path = _state_path(user_id)
    if path.exists():
        return _load_store_from_path(path)

    legacy_path = _legacy_state_path()
    if legacy_path.exists():
        store = _load_store_from_path(legacy_path)
        path.write_text(json.dumps(asdict(store), ensure_ascii=False, indent=2), encoding="utf-8")
        return store

    return DigestStateStore()


def load_digest_state(user_id: uuid.UUID, profile: DigestProfileName = "ai") -> ProfileDigestState:
    return getattr(load_digest_state_store(user_id), profile)


def save_digest_state(
    *,
    user_id: uuid.UUID,
    profile: DigestProfileName = "ai",
    status: str,
    articles_saved: int = 0,
    error: str | None = None,
    topics: list[str] | None = None,
    last_search_until: str | None = None,
    tuned_queries: list[str] | None = None,
    tuned_at: str | None = None,
) -> ProfileDigestState:
    store = load_digest_state_store(user_id)
    previous = getattr(store, profile)
    state = ProfileDigestState(
        last_run_at=datetime.now(UTC).isoformat(),
        last_status=status,
        last_articles_saved=articles_saved,
        last_error=error,
        last_topics=topics
        or (list(settings.digest_topics) if profile == "ai" else None),
        last_search_until=last_search_until
        if last_search_until is not None
        else previous.last_search_until,
        tuned_queries=tuned_queries if tuned_queries is not None else previous.tuned_queries,
        tuned_at=tuned_at if tuned_at is not None else previous.tuned_at,
    )
    setattr(store, profile, state)
    _state_path(user_id).write_text(
        json.dumps(asdict(store), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return state


def save_psych_tuned_queries(user_id: uuid.UUID, queries: list[str]) -> ProfileDigestState:
    previous = load_digest_state(user_id, "psychology")
    return save_digest_state(
        user_id=user_id,
        profile="psychology",
        status=previous.last_status,
        articles_saved=previous.last_articles_saved,
        error=previous.last_error,
        topics=queries,
        last_search_until=previous.last_search_until,
        tuned_queries=queries,
        tuned_at=datetime.now(UTC).isoformat(),
    )
