from __future__ import annotations

import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.user import User


def get_current_user(request: Request, db: Session) -> User | None:
    raw_user_id = request.session.get("app_user_id")
    if not raw_user_id:
        return None
    try:
        user_id = uuid.UUID(str(raw_user_id))
    except ValueError:
        return None
    return db.get(User, user_id)


def login_user(request: Request, user: User) -> None:
    request.session["app_user_id"] = str(user.id)


def logout_user(request: Request) -> None:
    request.session.pop("app_user_id", None)
