from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.models.entry_link import EntryLink
from app.schemas.entry import EntryType

VALID_LINK_TYPES = {
    "derived_from",
    "mentions",
    "assigned_to",
    "relates_to",
    "subtask_of",
}


def create_link(
    db: Session,
    *,
    user_id: uuid.UUID,
    source_entry_id: uuid.UUID,
    target_entry_id: uuid.UUID,
    link_type: str,
) -> EntryLink:
    if link_type not in VALID_LINK_TYPES:
        raise ValueError(f"Unsupported link type: {link_type}")
    if source_entry_id == target_entry_id:
        raise ValueError("Entry cannot link to itself")

    for entry_id in (source_entry_id, target_entry_id):
        entry = db.get(Entry, entry_id)
        if entry is None or entry.user_id != user_id:
            raise ValueError("Entry not found")

    existing = db.scalar(
        select(EntryLink).where(
            EntryLink.user_id == user_id,
            EntryLink.source_entry_id == source_entry_id,
            EntryLink.target_entry_id == target_entry_id,
            EntryLink.link_type == link_type,
        )
    )
    if existing is not None:
        return existing

    link = EntryLink(
        user_id=user_id,
        source_entry_id=source_entry_id,
        target_entry_id=target_entry_id,
        link_type=link_type,
    )
    db.add(link)
    return link


def delete_link(db: Session, *, user_id: uuid.UUID, link_id: uuid.UUID) -> bool:
    link = db.get(EntryLink, link_id)
    if link is None or link.user_id != user_id:
        return False
    db.delete(link)
    return True


def list_links_for_entry(db: Session, *, user_id: uuid.UUID, entry_id: uuid.UUID) -> list[EntryLink]:
    return list(
        db.scalars(
            select(EntryLink).where(
                EntryLink.user_id == user_id,
                (EntryLink.source_entry_id == entry_id) | (EntryLink.target_entry_id == entry_id),
            )
        ).all()
    )


def migrate_metadata_links_for_user(db: Session, user_id: uuid.UUID) -> int:
    """One-time style migration from metadata parent_id / linked_entry_ids to entry_links."""
    entries = db.scalars(select(Entry).where(Entry.user_id == user_id)).all()
    created = 0

    for entry in entries:
        metadata = entry.metadata_ or {}

        parent_id = metadata.get("parent_id")
        if isinstance(parent_id, str) and parent_id.strip():
            try:
                parent_uuid = uuid.UUID(parent_id)
                create_link(
                    db,
                    user_id=user_id,
                    source_entry_id=entry.id,
                    target_entry_id=parent_uuid,
                    link_type="subtask_of",
                )
                created += 1
            except ValueError:
                pass

        linked_ids = metadata.get("linked_entry_ids")
        if isinstance(linked_ids, list):
            for raw_target in linked_ids:
                if not isinstance(raw_target, str):
                    continue
                try:
                    target_uuid = uuid.UUID(raw_target)
                    create_link(
                        db,
                        user_id=user_id,
                        source_entry_id=entry.id,
                        target_entry_id=target_uuid,
                        link_type="relates_to",
                    )
                    created += 1
                except ValueError:
                    continue

        if entry.type == EntryType.task.value:
            assignee_id = metadata.get("assignee_id")
            if isinstance(assignee_id, str) and assignee_id.strip():
                try:
                    person_uuid = uuid.UUID(assignee_id)
                    create_link(
                        db,
                        user_id=user_id,
                        source_entry_id=entry.id,
                        target_entry_id=person_uuid,
                        link_type="assigned_to",
                    )
                    created += 1
                except ValueError:
                    pass

    return created
