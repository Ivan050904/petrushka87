from __future__ import annotations

from app.models.entry import Entry
from app.schemas.entry import EntryRead, EntryType


def serialize_entry(entry: Entry) -> EntryRead:
    return EntryRead(
        id=entry.id,
        type=EntryType(entry.type),
        title=entry.title,
        content=entry.content,
        metadata=entry.metadata_,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )
