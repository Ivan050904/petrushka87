"""Bridge Folio-One JWT/session auth into the transcription module."""

from __future__ import annotations

import uuid

from fastapi import Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.core.config import settings as app_settings
from app.models.user import User
from transcription import auth

AUTH_COOKIE_NAME = "folio_transcription_jwt"
AUTH_COOKIE_PATH = "/transcription"
AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7


def app_login_url() -> str:
    return app_settings.cors_origins[0] + "/login"


def request_is_secure(request: Request) -> bool:
    forwarded = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    if forwarded == "https":
        return True
    return request.url.scheme == "https"


def client_access_token(request: Request) -> str | None:
    return _extract_token(request)


def set_auth_cookie(response: Response, token: str, *, secure: bool) -> None:
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path=AUTH_COOKIE_PATH,
        max_age=AUTH_COOKIE_MAX_AGE,
    )


def _extract_token(request: Request) -> str | None:
    token = request.query_params.get("access_token")
    if token:
        return token.strip()
    cookie = request.cookies.get(AUTH_COOKIE_NAME)
    if cookie:
        return cookie.strip()
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
