from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID


class AssistantSessionRecord(Base):
    __tablename__ = "assistant_sessions"
    __table_args__ = (
        Index("ix_assistant_sessions_user_id", "user_id"),
        Index("ix_assistant_sessions_updated_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    messages: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    pending: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    pending_confirmation: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
