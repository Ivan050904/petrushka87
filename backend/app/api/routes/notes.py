from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.ai.analyze import LifeNoteAnalyzeResult, analyze_text_with_context
from app.services.ai.base import AIUnavailableError
from app.services.context.user_context import build_user_context

router = APIRouter()


class LifeNoteAnalyzeRequest(BaseModel):
    content: str = Field(min_length=1, max_length=50000)
    entry_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    entry_id: uuid.UUID | None = None


@router.post("/analyze", response_model=LifeNoteAnalyzeResult)
def analyze_note(
    payload: LifeNoteAnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LifeNoteAnalyzeResult:
    context = build_user_context(
        db,
        current_user.id,
        payload.content,
        scope="notes",
        limit=12,
        primary_entry_id=payload.entry_id,
    )
    try:
        return analyze_text_with_context(
            payload.content,
            entry_date=payload.entry_date,
            context=context,
        )
    except AIUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Notes AI request failed",
        ) from exc
