from __future__ import annotations

from pydantic import BaseModel

from app.schemas.entry import EntryRead


class DashboardRead(BaseModel):
    total_entries: int
    active_task_count: int
    recent_expense_count: int
    latest_entries: list[EntryRead]
    active_tasks: list[EntryRead]
    recent_expenses: list[EntryRead]
    recent_notes: list[EntryRead]
