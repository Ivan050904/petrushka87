from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.user_settings import UserSettings

router = APIRouter()


class UserSettingsRead(BaseModel):
    food_targets: dict[str, Any] | None = None
    finance_accounts: list[dict[str, Any]] | None = None
    finance_categories: list[str] | None = None


class UserSettingsPatch(BaseModel):
    food_targets: dict[str, Any] | None = None
    finance_accounts: list[dict[str, Any]] | None = None
    finance_categories: list[str] | None = None


def _get_or_create_settings(db: Session, user_id) -> UserSettings:
    row = db.get(UserSettings, user_id)
    if row is None:
        row = UserSettings(user_id=user_id, settings={})
        db.add(row)
        db.flush()
    return row


def _serialize_settings(settings: dict[str, Any]) -> UserSettingsRead:
    return UserSettingsRead(
        food_targets=settings.get("food_targets"),
        finance_accounts=settings.get("finance_accounts"),
        finance_categories=settings.get("finance_categories"),
    )


@router.get("", response_model=UserSettingsRead)
def get_user_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserSettingsRead:
    row = _get_or_create_settings(db, current_user.id)
    return _serialize_settings(row.settings or {})


@router.patch("", response_model=UserSettingsRead)
def patch_user_settings(
    payload: UserSettingsPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserSettingsRead:
    row = _get_or_create_settings(db, current_user.id)
    merged = dict(row.settings or {})
    patch = payload.model_dump(exclude_unset=True)
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        else:
            merged[key] = value
    row.settings = merged
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_settings(row.settings or {})
