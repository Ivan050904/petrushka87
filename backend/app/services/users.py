from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.security import get_password_hash


class UserAlreadyExistsError(ValueError):
    pass


def create_user(
    db: Session,
    *,
    email: str,
    password: str,
    full_name: str | None = None,
) -> User:
    normalized_email = email.strip().lower()
    existing_user = db.scalar(select(User).where(User.email == normalized_email))
    if existing_user is not None:
        raise UserAlreadyExistsError(f"User already exists: {normalized_email}")

    user = User(
        email=normalized_email,
        full_name=full_name.strip() if full_name else None,
        hashed_password=get_password_hash(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
