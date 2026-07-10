from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ValidationError
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.serializers import serialize_entry
from app.db.session import get_db
from app.models.entry import Entry
from app.models.user import User
from app.schemas.entry import EntryCreate, EntryList, EntryRead, EntryType, EntryUpdate
from app.schemas.metadata import normalize_metadata
from app.services.ai.factory import get_ai_client
from app.services.embeddings.indexer import index_entry

router = APIRouter()

LIFE_NOTES_MAX_LIMIT = 200


def _metadata_text(field: str):
    return func.json_extract(Entry.metadata_, f"$.{field}")


def _apply_metadata_filters(
    statement,
    *,
    collection: str | None,
    exclude_collection: str | None,
    category: str | None,
    kind: str | None,
    entry_date_from: str | None,
    entry_date_to: str | None,
):
    if collection:
        statement = statement.where(_metadata_text("collection") == collection)
    if exclude_collection:
        statement = statement.where(
            or_(
                _metadata_text("collection").is_(None),
                _metadata_text("collection") != exclude_collection,
            )
        )
    if category:
        statement = statement.where(_metadata_text("category") == category)
    if kind:
        statement = statement.where(_metadata_text("kind") == kind.strip())
    if entry_date_from:
        statement = statement.where(_metadata_text("entry_date") >= entry_date_from)
    if entry_date_to:
        statement = statement.where(_metadata_text("entry_date") <= entry_date_to)
    return statement


def _entry_title(title: str | None, content: str) -> str:
    candidate = (title or "").strip()
    if not candidate:
        candidate = content.strip().splitlines()[0] if content.strip() else "Untitled"
    return candidate[:157] + "..." if len(candidate) > 160 else candidate


def _get_owned_entry(db: Session, entry_id: uuid.UUID, user_id: uuid.UUID) -> Entry:
    entry = db.get(Entry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return entry


def _validated_metadata(entry_type: EntryType, metadata: dict[str, Any]) -> dict[str, Any]:
    try:
        return normalize_metadata(entry_type, metadata)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(include_context=False),
        ) from exc


def _validate_task_parent(
    db: Session,
    *,
    user_id: uuid.UUID,
    metadata: dict[str, Any],
    entry_id: uuid.UUID | None = None,
) -> None:
    parent_id = metadata.get("parent_id")
    if parent_id is None:
        return
    if not isinstance(parent_id, str) or not parent_id.strip():
        metadata["parent_id"] = None
        return

    try:
        parent_uuid = uuid.UUID(parent_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"loc": ["metadata", "parent_id"], "msg": "parent_id must be a valid task id"}],
        )

    if entry_id is not None and parent_uuid == entry_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"loc": ["metadata", "parent_id"], "msg": "task cannot be its own parent"}],
        )

    parent = db.get(Entry, parent_uuid)
    if parent is None or parent.user_id != user_id or parent.type != EntryType.task.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=[{"loc": ["metadata", "parent_id"], "msg": "parent task was not found"}],
        )

    seen_parent_ids: set[uuid.UUID] = set()
    current_parent = parent
    while current_parent is not None:
        if entry_id is not None and current_parent.id == entry_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"loc": ["metadata", "parent_id"], "msg": "task parent cycle detected"}],
            )
        if current_parent.id in seen_parent_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"loc": ["metadata", "parent_id"], "msg": "task parent cycle detected"}],
            )
        seen_parent_ids.add(current_parent.id)

        next_parent_id = current_parent.metadata_.get("parent_id")
        if not isinstance(next_parent_id, str) or not next_parent_id.strip():
            return
        try:
            next_parent_uuid = uuid.UUID(next_parent_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"loc": ["metadata", "parent_id"], "msg": "parent task chain is invalid"}],
            )
        current_parent = db.get(Entry, next_parent_uuid)
        if (
            current_parent is None
            or current_parent.user_id != user_id
            or current_parent.type != EntryType.task.value
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=[{"loc": ["metadata", "parent_id"], "msg": "parent task chain is invalid"}],
            )


def _resource_file_key(metadata: dict[str, Any]) -> str | None:
    file_metadata = metadata.get("file")
    if not isinstance(file_metadata, dict):
        return None

    key = file_metadata.get("key")
    if not isinstance(key, str):
        return None
    return key


def _delete_resource_file_key(key: str | None) -> None:
    if not key:
        return

    from app.api.routes import resources

    try:
        resources.storage.delete(key)
    except ValueError:
        return


def _delete_resource_file(entry: Entry) -> None:
    if entry.type != EntryType.resource.value:
        return

    _delete_resource_file_key(_resource_file_key(entry.metadata_))


def _clear_task_parent_references(db: Session, *, user_id: uuid.UUID, parent_id: uuid.UUID) -> None:
    tasks = db.scalars(
        select(Entry).where(Entry.user_id == user_id, Entry.type == EntryType.task.value)
    ).all()
    parent_id_raw = str(parent_id)
    now = datetime.now(UTC)

    for task in tasks:
        if str(task.metadata_.get("parent_id") or "") != parent_id_raw:
            continue
        task.metadata_ = {**task.metadata_, "parent_id": None}
        task.updated_at = now
        db.add(task)


@router.get("", response_model=EntryList)
def list_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    entry_type: EntryType | None = Query(default=None, alias="type"),
    q: str | None = Query(default=None, min_length=1),
    collection: str | None = Query(default=None, min_length=1, max_length=64),
    exclude_collection: str | None = Query(default=None, min_length=1, max_length=64),
    category: str | None = Query(default=None, min_length=1, max_length=64),
    kind: str | None = Query(default=None, min_length=1),
    entry_date_from: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    entry_date_to: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    sort: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> EntryList:
    effective_limit = min(limit, LIFE_NOTES_MAX_LIMIT) if collection else limit

    statement = select(Entry).where(Entry.user_id == current_user.id)

    if entry_type is not None:
        statement = statement.where(Entry.type == entry_type.value)

    statement = _apply_metadata_filters(
        statement,
        collection=collection,
        exclude_collection=exclude_collection,
        category=category,
        kind=kind,
        entry_date_from=entry_date_from,
        entry_date_to=entry_date_to,
    )

    if q:
        pattern = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                Entry.title.ilike(pattern),
                Entry.content.ilike(pattern),
                cast(Entry.metadata_, String).ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0

    if sort == "entry_date_desc" or (sort is None and collection == "life_notes"):
        order_clause = (
            _metadata_text("entry_date").desc(),
            Entry.updated_at.desc(),
            Entry.created_at.desc(),
        )
    elif sort == "entry_date_asc":
        order_clause = (
            _metadata_text("entry_date").asc(),
            Entry.created_at.asc(),
            Entry.updated_at.asc(),
        )
    else:
        order_clause = (Entry.updated_at.desc(), Entry.created_at.desc())

    entries = db.scalars(
        statement.order_by(*order_clause).offset(offset).limit(effective_limit)
    ).all()

    return EntryList(items=[serialize_entry(entry) for entry in entries], total=total)


@router.post("", response_model=EntryRead, status_code=status.HTTP_201_CREATED)
def create_entry(
    payload: EntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EntryRead:
    entry_type = payload.type
    entry_title = _entry_title(payload.title, payload.content)
    entry_metadata = dict(payload.metadata)

    if payload.type == EntryType.note:
        if not entry_metadata.get("board"):
            ai_client = get_ai_client()
            if ai_client is not None:
                ai_usage: dict[str, Any] | None = None
                try:
                    classification = ai_client.classify_entry(payload.content)
                    if classification.usage is not None:
                        ai_usage = classification.usage.model_dump(
                            mode="json",
                            exclude_none=True,
                        )
                    classified_metadata = {**classification.metadata, **entry_metadata}
                    ai_metadata: dict[str, Any] = {
                        "classification": {
                            "type": classification.type.value,
                            "confidence": classification.confidence,
                        }
                    }
                    if ai_usage is not None:
                        ai_metadata["usage"] = ai_usage
                    classified_metadata["ai"] = ai_metadata
                    classified_metadata = normalize_metadata(classification.type, classified_metadata)
                    if classification.type == EntryType.task:
                        _validate_task_parent(db, user_id=current_user.id, metadata=classified_metadata)
                    entry_type = classification.type
                    entry_title = _entry_title(classification.title or payload.title, payload.content)
                    entry_metadata = classified_metadata
                except Exception as exc:
                    error_metadata: dict[str, Any] = {"classification_error": exc.__class__.__name__}
                    if ai_usage is not None:
                        error_metadata["usage"] = ai_usage
                    entry_metadata["ai"] = error_metadata

    entry_metadata = _validated_metadata(entry_type, entry_metadata)
    if entry_type == EntryType.task:
        _validate_task_parent(db, user_id=current_user.id, metadata=entry_metadata)

    entry = Entry(
        user_id=current_user.id,
        type=entry_type.value,
        title=entry_title,
        content=payload.content,
        metadata_=entry_metadata,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    index_entry(db, entry)
    db.commit()
    return serialize_entry(entry)


@router.get("/{entry_id}", response_model=EntryRead)
def read_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EntryRead:
    entry = _get_owned_entry(db, entry_id, current_user.id)
    return serialize_entry(entry)


@router.patch("/{entry_id}", response_model=EntryRead)
def update_entry(
    entry_id: uuid.UUID,
    payload: EntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EntryRead:
    entry = _get_owned_entry(db, entry_id, current_user.id)
    previous_type = entry.type
    previous_resource_key = (
        _resource_file_key(entry.metadata_) if previous_type == EntryType.resource.value else None
    )
    update_data = payload.model_dump(exclude_unset=True)
    should_validate_metadata = False
    next_metadata = entry.metadata_

    if "type" in update_data and update_data["type"] is not None:
        entry.type = update_data["type"].value
        should_validate_metadata = True
    if "title" in update_data:
        entry.title = _entry_title(update_data["title"], entry.content)
    if "content" in update_data and update_data["content"] is not None:
        entry.content = update_data["content"]
        if not entry.title:
            entry.title = _entry_title(None, entry.content)
    if "metadata" in update_data and update_data["metadata"] is not None:
        next_metadata = update_data["metadata"]
        should_validate_metadata = True

    if should_validate_metadata:
        entry.metadata_ = _validated_metadata(EntryType(entry.type), next_metadata)
        if entry.type == EntryType.task.value:
            _validate_task_parent(
                db,
                user_id=current_user.id,
                metadata=entry.metadata_,
                entry_id=entry.id,
            )

    entry.updated_at = datetime.now(UTC)
    db.add(entry)
    db.commit()
    current_resource_key = (
        _resource_file_key(entry.metadata_) if entry.type == EntryType.resource.value else None
    )
    if previous_resource_key is not None and previous_resource_key != current_resource_key:
        _delete_resource_file_key(previous_resource_key)
    db.refresh(entry)
    index_entry(db, entry)
    db.commit()
    return serialize_entry(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    entry = _get_owned_entry(db, entry_id, current_user.id)
    if entry.type == EntryType.task.value:
        _clear_task_parent_references(db, user_id=current_user.id, parent_id=entry.id)
    _delete_resource_file(entry)
    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
