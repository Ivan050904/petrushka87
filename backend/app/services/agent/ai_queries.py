from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.services.agent.state import load_digest_state

AI_TUNED_QUERY_COUNT = 5


def _tuned_queries_fresh(tuned_at: str | None) -> bool:
    if not tuned_at:
        return False
    try:
        parsed = datetime.fromisoformat(tuned_at)
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    max_age = timedelta(days=max(settings.ai_digest_tuned_queries_max_age_days, 1))
    return datetime.now(UTC) - parsed.astimezone(UTC) < max_age


def get_tuned_ai_queries(user_id: uuid.UUID) -> list[str] | None:
    state = load_digest_state(user_id, "ai")
    if not state.tuned_queries or not _tuned_queries_fresh(state.tuned_at):
        return None
    queries = [item.strip() for item in state.tuned_queries if item.strip()]
    return queries or None


def configured_ai_queries(user_id: uuid.UUID) -> list[str]:
    tuned = get_tuned_ai_queries(user_id)
    if tuned:
        return tuned
    return list(settings.digest_topics)


def uses_tuned_ai_queries(user_id: uuid.UUID) -> bool:
    return get_tuned_ai_queries(user_id) is not None


def get_active_ai_query_source(user_id: uuid.UUID) -> str:
    if uses_tuned_ai_queries(user_id):
        return "ollama"
    if settings.digest_topics:
        return "config"
    return "static"
