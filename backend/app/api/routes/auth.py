from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import Token, UserCreate, UserLogin, UserRead
from app.services.security import create_access_token, verify_password

router = APIRouter()


def _token_for_user(user: User) -> Token:
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(subject=str(user.id), expires_delta=expires_delta)
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserRead.model_validate(user),
    )


@router.post("/register", status_code=status.HTTP_403_FORBIDDEN)
def register(_payload: UserCreate) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Registration disabled",
    )


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
@limiter.limit("20/hour")
async def login(
    request: Request,
    db: Session = Depends(get_db),
) -> Token:
    credentials = UserLogin.model_validate(await request.json())
    del request
    user = db.scalar(select(User).where(User.email == credentials.email.lower()))
    if user is None or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return _token_for_user(user)


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)
