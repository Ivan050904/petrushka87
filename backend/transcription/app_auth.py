"""Bridge Folio-One JWT/session auth into the transcription module."""

from __future__ import annotations

import uuid

from fastapi import Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.models.user import User
from transcription import auth


def app_login_url() -> str:
    return app_settings.cors_origins[0] + "/login"


def _extract_token(request: Request) -> str | None:
    token = request.query_params.get("access_token")
    if token:
        return token.strip()
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def _decode_app_user_id(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(
            token,
            app_settings.secret_key,
            algorithms=[app_settings.jwt_algorithm],
        )
        subject = payload.get("sub")
        if not subject:
            return None
        return uuid.UUID(str(subject))
    except (JWTError, ValueError):
        return None


def resolve_user(request: Request, db: Session) -> User | None:
    user = auth.get_current_user(request, db)
    if user is not None:
        return user

    token = _extract_token(request)
    if not token:
        return None

    user_id = _decode_app_user_id(token)
    if user_id is None:
        return None

    user = db.get(User, user_id)
    if user is None:
        return None

    auth.login_user(request, user)
    return user
