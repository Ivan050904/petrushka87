from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID


class TherapySessionJob(Base):
    __tablename__ = "therapy_session_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entry_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(),
        ForeignKey("entries.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(500), default="")
    session_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    stage: Mapped[str] = mapped_column(String(100), default="В очереди")
    stage_key: Mapped[str] = mapped_column(String(30), default="upload")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    reprocess_mode: Mapped[str] = mapped_column(String(10), default="")
    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    source_filename: Mapped[str] = mapped_column(String(500), default="")
    file_storage_key: Mapped[str] = mapped_column(String(500), default="")
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)
    transcription_source: Mapped[str] = mapped_column(String(30), default="")

    transcript: Mapped[str] = mapped_column(Text, default="")
    diarized_transcript: Mapped[str] = mapped_column(Text, default="")
    speakers_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default="{}")

    analysis_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default="{}")
    analysis_markdown: Mapped[str] = mapped_column(Text, default="")
    analysis_model: Mapped[str] = mapped_column(String(100), default="")
    error: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", back_populates="therapy_session_jobs")
    entry = relationship("Entry", back_populates="therapy_session_job")
