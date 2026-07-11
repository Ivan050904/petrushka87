from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID


class EntryEmbedding(Base):
    __tablename__ = "entry_embeddings"
    __table_args__ = (
        UniqueConstraint("entry_id", "chunk_index", name="uq_entry_embeddings_chunk"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("entries.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    source_type: Mapped[str] = mapped_column(String(32), default="entry")
    text_snippet: Mapped[str] = mapped_column(Text, nullable=False)
    vector: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    entry_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    scope: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    collection: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entry_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
