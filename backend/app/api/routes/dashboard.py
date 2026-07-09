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


@router.get("", response_model=DashboardRead)
def read_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardRead:
    total_entries = (
        db.scalar(select(func.count()).select_from(Entry).where(Entry.user_id == current_user.id))
        or 0
    )
    latest_entries = _entries_by_type(db, current_user.id, limit=8)
    tasks = _entries_by_type(db, current_user.id, entry_type="task")
    finance_entries = _entries_by_type(db, current_user.id, entry_type="finance")
    notes = _entries_by_type(db, current_user.id, entry_type="note", limit=5)

    active_tasks = [
        task
        for task in tasks
        if str(task.metadata_.get("status") or "inbox") == "active"
    ]
    recent_expenses = [
        entry for entry in finance_entries if entry.metadata_.get("direction") == "expense"
    ]

    return DashboardRead(
        total_entries=total_entries,
        active_task_count=len(active_tasks),
        recent_expense_count=len(recent_expenses),
        latest_entries=[serialize_entry(entry) for entry in latest_entries],
        active_tasks=[serialize_entry(entry) for entry in active_tasks[:5]],
        recent_expenses=[serialize_entry(entry) for entry in recent_expenses[:5]],
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
