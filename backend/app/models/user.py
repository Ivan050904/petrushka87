from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    entries = relationship("Entry", back_populates="user", cascade="all, delete-orphan")
    transcription_jobs = relationship(
        "TranscriptionJob",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    transcription_chats = relationship(
        "TranscriptionChat",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    therapy_session_jobs = relationship(
        "TherapySessionJob",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    assistant_conversations = relationship(
        "AssistantConversation",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    exercise_catalog_items = relationship(
        "ExerciseCatalog",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    workout_sessions = relationship(
        "WorkoutSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    personal_records = relationship(
        "PersonalRecord",
        back_populates="user",
        cascade="all, delete-orphan",
    )
