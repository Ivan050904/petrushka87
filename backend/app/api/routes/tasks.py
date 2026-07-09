from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.models.user import User
from app.services.ai.base import AIUnavailableError, TaskParseResult
from app.services.ai.factory import get_ai_client

router = APIRouter()


class TaskParseRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


@router.post("/parse", response_model=TaskParseResult)
def parse_tasks(
    payload: TaskParseRequest,
    current_user: User = Depends(get_current_user),
) -> TaskParseResult:
    del current_user
    ai_client = get_ai_client()
    if ai_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI parser is not configured",
        )

    try:
        return ai_client.parse_tasks(payload.content)
    except AIUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI parser request failed",
        ) from exc
