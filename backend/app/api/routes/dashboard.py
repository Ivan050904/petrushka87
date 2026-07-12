from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.serializers import serialize_entry
from app.db.session import get_db
from app.models.entry import Entry
from app.models.user import User
from app.schemas.dashboard import DashboardRead

router = APIRouter()


def _metadata_text(field: str):
    return func.json_extract(Entry.metadata_, f"$.{field}")


def _active_task_filters(user_id: object):
    return (
        Entry.user_id == user_id,
        Entry.type == "task",
        func.coalesce(_metadata_text("status"), "inbox") == "active",
    )


def _expense_filters(user_id: object):
    return (
        Entry.user_id == user_id,
        Entry.type == "finance",
        _metadata_text("direction") == "expense",
    )


@router.get("", response_model=DashboardRead)
def read_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardRead:
    total_entries = (
        db.scalar(select(func.count()).select_from(Entry).where(Entry.user_id == current_user.id))
        or 0
    )
    active_task_count = (
        db.scalar(select(func.count()).select_from(Entry).where(*_active_task_filters(current_user.id)))
        or 0
    )
    recent_expense_count = (
        db.scalar(select(func.count()).select_from(Entry).where(*_expense_filters(current_user.id)))
        or 0
    )

    latest_entries = _entries_by_type(db, current_user.id, limit=8)
    active_tasks = list(
        db.scalars(
            select(Entry)
            .where(*_active_task_filters(current_user.id))
            .order_by(Entry.updated_at.desc(), Entry.created_at.desc())
            .limit(5)
        ).all()
    )
    recent_expenses = list(
        db.scalars(
            select(Entry)
            .where(*_expense_filters(current_user.id))
            .order_by(Entry.updated_at.desc(), Entry.created_at.desc())
            .limit(5)
        ).all()
    )
    notes = _entries_by_type(db, current_user.id, entry_type="note", limit=5)

    return DashboardRead(
        total_entries=total_entries,
        active_task_count=active_task_count,
        recent_expense_count=recent_expense_count,
        latest_entries=[serialize_entry(entry) for entry in latest_entries],
        active_tasks=[serialize_entry(entry) for entry in active_tasks],
        recent_expenses=[serialize_entry(entry) for entry in recent_expenses],
        recent_notes=[serialize_entry(entry) for entry in notes],
    )


def _entries_by_type(
    db: Session,
    user_id: object,
    *,
    entry_type: str | None = None,
    limit: int | None = None,
) -> list[Entry]:
    statement = select(Entry).where(Entry.user_id == user_id)
    if entry_type is not None:
        statement = statement.where(Entry.type == entry_type)
    statement = statement.order_by(Entry.updated_at.desc(), Entry.created_at.desc())
    if limit is not None:
        statement = statement.limit(limit)
    return list(db.scalars(statement).all())
