from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.serializers import serialize_entry
from app.db.session import get_db
from app.models.entry import Entry
from app.models.user import User
from app.schemas.entry import EntryRead, EntryType

router = APIRouter()


class AgendaRead(BaseModel):
    tasks: list[EntryRead]
    events: list[EntryRead]
    reminders: list[EntryRead]


@router.get("/agenda", response_model=AgendaRead)
def get_agenda(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=500, ge=1, le=500),
) -> AgendaRead:
    tasks = db.scalars(
        select(Entry)
        .where(Entry.user_id == current_user.id, Entry.type == EntryType.task.value)
        .order_by(Entry.updated_at.desc())
        .limit(limit)
    ).all()
    events = db.scalars(
        select(Entry)
        .where(Entry.user_id == current_user.id, Entry.type == EntryType.event.value)
        .order_by(Entry.updated_at.desc())
        .limit(limit)
    ).all()
    reminders = db.scalars(
        select(Entry)
        .where(Entry.user_id == current_user.id, Entry.type == EntryType.reminder.value)
        .order_by(Entry.updated_at.desc())
        .limit(limit)
    ).all()
    return AgendaRead(
        tasks=[serialize_entry(entry) for entry in tasks],
        events=[serialize_entry(entry) for entry in events],
        reminders=[serialize_entry(entry) for entry in reminders],
    )
