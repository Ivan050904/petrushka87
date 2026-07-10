from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.services.agent.digest import compute_search_date_range, run_daily_digest
from app.services.agent.llm import check_ollama_health
from app.services.agent.state import load_digest_state

router = APIRouter()


class DigestRunRequest(BaseModel):
    topics: list[str] | None = Field(default=None, max_length=20)
    max_articles: int | None = Field(default=None, ge=1, le=20)


class DigestRunResponse(BaseModel):
    status: str
    articles_saved: int
    articles_skipped: int
    topics: list[str]
    message: str
    search_period_from: str | None = None
    search_period_to: str | None = None


class DigestStatusResponse(BaseModel):
    enabled: bool
    ollama_reachable: bool
    schedule_hour: int
    scheduler_enabled: bool
    configured_topics: list[str]
    search_provider: str
    last_run_at: str | None = None
    last_status: str = "idle"
    last_articles_saved: int = 0
    last_error: str | None = None
    last_topics: list[str] | None = None
    last_search_until: str | None = None
    next_search_from: str | None = None


def _user_today() -> date:
    from app.services.agent.digest import _user_today as digest_user_today

    return digest_user_today()


@router.get("/digest/status", response_model=DigestStatusResponse)
def digest_status(
    current_user: User = Depends(get_current_user),
) -> DigestStatusResponse:
    del current_user
    state = load_digest_state()
    today = _user_today()
    date_range = compute_search_date_range(
        today=today,
        last_search_until=state.last_search_until,
        lookback_days=settings.digest_first_run_lookback_days,
    )
    next_search_from = date_range.date_from.isoformat() if date_range else None

    return DigestStatusResponse(
        enabled=settings.digest_enabled,
        ollama_reachable=check_ollama_health(),
        schedule_hour=settings.digest_schedule_hour,
        scheduler_enabled=settings.digest_scheduler_enabled,
        configured_topics=list(settings.digest_topics),
        search_provider=settings.digest_search_provider,
        last_run_at=state.last_run_at,
        last_status=state.last_status,
        last_articles_saved=state.last_articles_saved,
        last_error=state.last_error,
        last_topics=state.last_topics,
        last_search_until=state.last_search_until,
        next_search_from=next_search_from,
    )


@router.post("/digest/run", response_model=DigestRunResponse)
def digest_run(
    payload: DigestRunRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DigestRunResponse:
    request = payload or DigestRunRequest()
    try:
        result = run_daily_digest(
            db,
            user_id=current_user.id,
            topics=request.topics,
            max_articles=request.max_articles,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc) or exc.__class__.__name__,
        ) from exc

    return DigestRunResponse(
        status=result.status,
        articles_saved=result.articles_saved,
        articles_skipped=result.articles_skipped,
        topics=result.topics,
        message=result.message,
        search_period_from=result.search_period_from,
        search_period_to=result.search_period_to,
    )
