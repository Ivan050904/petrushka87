from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from app.models.entry import Entry
from app.schemas.entry import EntryType
from app.schemas.metadata import normalize_metadata
from app.services.assistant.schemas import AssistantActionResult, PendingAction

TASK_REQUIRED = ("title",)
EVENT_REQUIRED = ("title", "starts_at")


def required_fields_for(action: str) -> tuple[str, ...]:
    if action == "create_task":
        return TASK_REQUIRED
    if action == "create_event":
        return EVENT_REQUIRED
    return ()


def missing_fields(action: str, params: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    for field in required_fields_for(action):
        value = params.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(field)
    return missing


def merge_pending_params(pending: PendingAction, user_message: str) -> dict[str, Any]:
    merged = dict(pending.params)
    text = user_message.strip()
    if not text:
        return merged

    if pending.action == "create_event":
        if "starts_at" in pending.missing_fields and "starts_at" not in merged:
            merged["starts_at"] = text
        elif "location" in pending.missing_fields and "location" not in merged:
            merged["location"] = text
        elif "title" in pending.missing_fields and "title" not in merged:
            merged["title"] = text
        else:
            merged.setdefault("content", text)
            if "starts_at" not in merged:
                merged["starts_at"] = text
    elif pending.action == "create_task":
        if "title" in pending.missing_fields and "title" not in merged:
            merged["title"] = text
        elif "deadline" in pending.missing_fields and "deadline" not in merged:
            merged["deadline"] = text
        elif "scheduled_at" in pending.missing_fields and "scheduled_at" not in merged:
            merged["scheduled_at"] = text
        else:
            merged.setdefault("content", text)
    return merged


def build_pending(action: str, params: dict[str, Any]) -> PendingAction | None:
    missing = missing_fields(action, params)
    if not missing:
        return None
    return PendingAction(action=action, params=params, missing_fields=missing)


def _entry_title(title: str | None, content: str | None) -> str:
    candidate = (title or content or "").strip()
    if not candidate:
        candidate = "Без названия"
    return candidate[:157] + "..." if len(candidate) > 160 else candidate


def create_task_entry(
    db: Session,
    *,
    user_id: uuid.UUID,
    params: dict[str, Any],
) -> AssistantActionResult:
    title = _entry_title(params.get("title"), params.get("content"))
    content = str(params.get("content") or title).strip()
    metadata: dict[str, Any] = {
        "status": params.get("status") or "active",
        "source": "assistant",
    }
    for key in ("scheduled_at", "ends_at", "deadline", "project", "priority", "planned_duration_minutes"):
        if params.get(key) is not None:
            metadata[key] = params[key]

    metadata = normalize_metadata(EntryType.task, metadata)
    entry = Entry(
        user_id=user_id,
        type=EntryType.task.value,
        title=title,
        content=content,
        metadata_=metadata,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return AssistantActionResult(
        type="task",
        title=entry.title,
        entry_id=str(entry.id),
        metadata=entry.metadata_,
    )


def create_event_entry(
    db: Session,
    *,
    user_id: uuid.UUID,
    params: dict[str, Any],
) -> AssistantActionResult:
    title = _entry_title(params.get("title"), params.get("content"))
    content = str(params.get("content") or title).strip()
    metadata: dict[str, Any] = {
        "starts_at": params["starts_at"],
        "status": params.get("status") or "attending",
        "source": "assistant",
        "linked_entry_ids": [],
    }
    for key in ("ends_at", "location", "source_url"):
        if params.get(key) is not None:
            metadata[key] = params[key]

    metadata = normalize_metadata(EntryType.event, metadata)
    entry = Entry(
        user_id=user_id,
        type=EntryType.event.value,
        title=title,
        content=content,
        metadata_=metadata,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return AssistantActionResult(
        type="event",
        title=entry.title,
        entry_id=str(entry.id),
        metadata=entry.metadata_,
    )


def execute_pending(
    db: Session,
    *,
    user_id: uuid.UUID,
    pending: PendingAction,
) -> AssistantActionResult:
    missing = missing_fields(pending.action, pending.params)
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    if pending.action == "create_task":
        return create_task_entry(db, user_id=user_id, params=pending.params)
    if pending.action == "create_event":
        return create_event_entry(db, user_id=user_id, params=pending.params)
    raise ValueError(f"Unsupported action: {pending.action}")


def list_entries_preview(
    db: Session,
    *,
    user_id: uuid.UUID,
    params: dict[str, Any],
    limit: int = 8,
) -> list[dict[str, Any]]:
    entry_type = params.get("type")
    query = params.get("query")

    statement = select(Entry).where(Entry.user_id == user_id)
    if entry_type in {"task", "event"}:
        statement = statement.where(Entry.type == entry_type)
    else:
        statement = statement.where(Entry.type.in_([EntryType.task.value, EntryType.event.value]))

    if isinstance(query, str) and query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            or_(
                Entry.title.ilike(pattern),
                Entry.content.ilike(pattern),
                cast(Entry.metadata_, String).ilike(pattern),
            )
        )

    entries = db.scalars(
        statement.order_by(Entry.updated_at.desc(), Entry.created_at.desc()).limit(limit)
    ).all()

    preview: list[dict[str, Any]] = []
    for entry in entries:
        item: dict[str, Any] = {
            "id": str(entry.id),
            "type": entry.type,
            "title": entry.title,
        }
        if entry.type == EntryType.task.value:
            item["deadline"] = entry.metadata_.get("deadline")
            item["scheduled_at"] = entry.metadata_.get("scheduled_at")
            item["status"] = entry.metadata_.get("status")
        if entry.type == EntryType.event.value:
            item["starts_at"] = entry.metadata_.get("starts_at")
            item["ends_at"] = entry.metadata_.get("ends_at")
            item["location"] = entry.metadata_.get("location")
        preview.append(item)
    return preview


def validate_pending_params(action: str, params: dict[str, Any]) -> dict[str, Any]:
    if action == "create_task":
        metadata: dict[str, Any] = {
            "status": params.get("status") or "active",
            "source": "assistant",
        }
        for key in ("scheduled_at", "ends_at", "deadline", "project", "priority", "planned_duration_minutes"):
            if params.get(key) is not None:
                metadata[key] = params[key]
        return normalize_metadata(EntryType.task, metadata)
    if action == "create_event":
        metadata = {
            "starts_at": params["starts_at"],
            "status": params.get("status") or "attending",
            "source": "assistant",
            "linked_entry_ids": [],
        }
        for key in ("ends_at", "location", "source_url"):
            if params.get(key) is not None:
                metadata[key] = params[key]
        return normalize_metadata(EntryType.event, metadata)
    raise ValueError(f"Unsupported action: {action}")


def _get_owned_entry(db: Session, entry_id: str, user_id: uuid.UUID) -> Entry:
    try:
        entry_uuid = uuid.UUID(entry_id)
    except ValueError as exc:
        raise ValueError("entry_id must be a valid UUID") from exc

    entry = db.get(Entry, entry_uuid)
    if entry is None or entry.user_id != user_id:
        raise ValueError("entry was not found")
    return entry


def update_entry_record(
    db: Session,
    *,
    user_id: uuid.UUID,
    params: dict[str, Any],
) -> AssistantActionResult:
    entry_id = params.get("entry_id")
    if not isinstance(entry_id, str) or not entry_id.strip():
        raise ValueError("entry_id is required")

    entry = _get_owned_entry(db, entry_id.strip(), user_id)
    if entry.type not in {EntryType.task.value, EntryType.event.value}:
        raise ValueError("only tasks and events can be updated")

    if isinstance(params.get("title"), str) and params["title"].strip():
        entry.title = _entry_title(params.get("title"), entry.content)
    if isinstance(params.get("content"), str) and params["content"].strip():
        entry.content = params["content"].strip()

    metadata = dict(entry.metadata_)
    if entry.type == EntryType.task.value:
        for key in ("status", "scheduled_at", "ends_at", "deadline", "project", "priority", "planned_duration_minutes"):
            if params.get(key) is not None:
                metadata[key] = params[key]
    else:
        for key in ("starts_at", "ends_at", "location", "status", "source_url"):
            if params.get(key) is not None:
                metadata[key] = params[key]

    entry.metadata_ = normalize_metadata(EntryType(entry.type), metadata)
    entry.updated_at = datetime.now(UTC)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return AssistantActionResult(
        type="task" if entry.type == EntryType.task.value else "event",
        title=entry.title,
        entry_id=str(entry.id),
        metadata=entry.metadata_,
    )

