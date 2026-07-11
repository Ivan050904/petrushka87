from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.serializers import serialize_entry
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.entry import EntryRead
from app.services.agent.article_feedback import apply_article_feedback, load_feedback_profile
from app.services.agent.digest import compute_search_date_range, run_daily_digest, _resolve_user
from app.services.agent.llm import check_ollama_health
from app.services.agent.psych_query_tuner import get_active_psych_query_source, tune_psych_queries
from app.services.agent.state import load_digest_state

router = APIRouter()

DigestProfileName = Literal["ai", "psychology"]


class DigestRunRequest(BaseModel):
    profile: DigestProfileName = "ai"
    topics: list[str] | None = Field(default=None, max_length=20)
    max_articles: int | None = Field(default=None, ge=1, le=20)
    force: bool = False


class DigestRunResponse(BaseModel):
    status: str
    articles_saved: int
    articles_skipped: int
    topics: list[str]
    message: str
    search_period_from: str | None = None
    search_period_to: str | None = None
    profile: DigestProfileName = "ai"


class ArticleFeedbackRequest(BaseModel):
    entry_id: uuid.UUID
    feedback: Literal["dislike", "off_topic"]


class DigestProfileStatus(BaseModel):
    enabled: bool
    last_run_at: str | None = None
    last_status: str = "idle"
    last_articles_saved: int = 0
    last_error: str | None = None
    last_topics: list[str] | None = None
    last_search_until: str | None = None
    next_search_from: str | None = None
    query_source: str | None = None
    tuned_at: str | None = None


class PsychQueryTuneResponse(BaseModel):
    status: str
    queries: list[str]
    message: str
    source: str
    next_search_from: str | None = None


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
    psychology: DigestProfileStatus


def _user_today() -> date:
    from app.services.agent.digest import _user_today as digest_user_today

    return digest_user_today()


def _profile_status(profile: DigestProfileName) -> DigestProfileStatus:
    state = load_digest_state(profile)
    today = _user_today()
    date_range = compute_search_date_range(
        today=today,
        last_search_until=state.last_search_until,
        lookback_days=settings.digest_first_run_lookback_days,
    )
    next_search_from = date_range.date_from.isoformat() if date_range else None

    if profile == "psychology":
        enabled = settings.psych_digest_enabled
        query_source = get_active_psych_query_source()
        tuned_at = state.tuned_at
    else:
        enabled = settings.digest_enabled
        query_source = None
        tuned_at = None

    return DigestProfileStatus(
        enabled=enabled,
        last_run_at=state.last_run_at,
        last_status=state.last_status,
        last_articles_saved=state.last_articles_saved,
        last_error=state.last_error,
        last_topics=state.last_topics,
        last_search_until=state.last_search_until,
        next_search_from=next_search_from,
        query_source=query_source,
        tuned_at=tuned_at,
    )


@router.get("/digest/status", response_model=DigestStatusResponse)
def digest_status(
    current_user: User = Depends(get_current_user),
) -> DigestStatusResponse:
    del current_user
    ai_status = _profile_status("ai")
    psych_status = _profile_status("psychology")

    return DigestStatusResponse(
        enabled=ai_status.enabled,
        ollama_reachable=check_ollama_health(),
        schedule_hour=settings.digest_schedule_hour,
        scheduler_enabled=settings.digest_scheduler_enabled,
        configured_topics=list(settings.digest_topics),
        search_provider=settings.digest_search_provider,
        last_run_at=ai_status.last_run_at,
        last_status=ai_status.last_status,
        last_articles_saved=ai_status.last_articles_saved,
        last_error=ai_status.last_error,
        last_topics=ai_status.last_topics,
        last_search_until=ai_status.last_search_until,
        next_search_from=ai_status.next_search_from,
        psychology=psych_status,
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
            force=request.force,
            profile=request.profile,
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
        profile=result.profile,
    )


@router.post("/digest/feedback", response_model=EntryRead)
def digest_feedback(
    payload: ArticleFeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EntryRead:
    entry = apply_article_feedback(
        db,
        user_id=current_user.id,
        entry_id=payload.entry_id,
        feedback=payload.feedback,
    )
    return serialize_entry(entry)


@router.post("/digest/psychology/tune-queries", response_model=PsychQueryTuneResponse)
def psych_tune_queries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PsychQueryTuneResponse:
    feedback_profile = load_feedback_profile(
        db,
        current_user.id,
        collection="psychology",
    )
    result = tune_psych_queries(feedback_profile)
    return PsychQueryTuneResponse(
        status=result.status,
        queries=result.queries,
        message=result.message,
        source=result.source,
    )
