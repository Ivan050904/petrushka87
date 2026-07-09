from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EntryType(str, Enum):
    task = "task"
    reminder = "reminder"
    event = "event"
    finance = "finance"
    habit = "habit"
    food = "food"
    person = "person"
    note = "note"
    diary = "diary"
    resource = "resource"
    transcription = "transcription"


class EntryCreate(BaseModel):
    type: EntryType = EntryType.note
    title: str | None = Field(default=None, max_length=160)
    content: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EntryUpdate(BaseModel):
    type: EntryType | None = None
    title: str | None = Field(default=None, max_length=160)
    content: str | None = Field(default=None, min_length=1)
    metadata: dict[str, Any] | None = None


class EntryRead(BaseModel):
    id: uuid.UUID
    type: EntryType
    title: str
    content: str
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class EntryList(BaseModel):
    items: list[EntryRead]
    total: int
