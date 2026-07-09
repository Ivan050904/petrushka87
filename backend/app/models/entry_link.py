from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import GUID


class EntryLink(Base):
    __tablename__ = "entry_links"
    __table_args__ = (
        UniqueConstraint("source_entry_id", "target_entry_id", "link_type", name="uq_entry_links_edge"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    source_entry_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("entries.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    target_entry_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("entries.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    link_type: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
