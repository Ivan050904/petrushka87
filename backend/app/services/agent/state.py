from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import settings


def _state_path() -> Path:
    path = Path(__file__).resolve().parents[3] / "storage" / "logs" / "digest_state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


@dataclass
class DigestState:
    last_run_at: str | None = None
    last_status: str = "idle"
    last_articles_saved: int = 0
    last_error: str | None = None
    last_topics: list[str] | None = None
    last_search_until: str | None = None


def load_digest_state() -> DigestState:
    path = _state_path()
    if not path.exists():
        return DigestState()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return DigestState(
            last_run_at=raw.get("last_run_at"),
            last_status=raw.get("last_status", "idle"),
            last_articles_saved=int(raw.get("last_articles_saved", 0)),
            last_error=raw.get("last_error"),
            last_topics=raw.get("last_topics"),
            last_search_until=raw.get("last_search_until"),
        )
    except (json.JSONDecodeError, TypeError, ValueError):
        return DigestState()


def save_digest_state(
    *,
    status: str,
    articles_saved: int = 0,
    error: str | None = None,
    topics: list[str] | None = None,
    last_search_until: str | None = None,
) -> DigestState:
    previous = load_digest_state()
    state = DigestState(
        last_run_at=datetime.now(UTC).isoformat(),
        last_status=status,
        last_articles_saved=articles_saved,
        last_error=error,
        last_topics=topics or list(settings.digest_topics),
        last_search_until=last_search_until
        if last_search_until is not None
        else previous.last_search_until,
    )
    _state_path().write_text(
        json.dumps(asdict(state), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return state
