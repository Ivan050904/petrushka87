from __future__ import annotations

import re
from datetime import UTC, date, datetime, time
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.config import settings
from app.schemas.entry import EntryType

_TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")


class TaskRecurrenceRule(BaseModel):
    kind: Literal["weekly"] = "weekly"
    weekdays: list[int] = Field(default_factory=list)
    time: str = "09:00"

    @model_validator(mode="after")
    def validate_weekly_rule(self) -> "TaskRecurrenceRule":
        unique_days = sorted(set(self.weekdays))
        if not unique_days:
            raise ValueError("weekdays must include at least one day")
        if any(day < 1 or day > 7 for day in unique_days):
            raise ValueError("weekdays must use 1..7")
        self.weekdays = unique_days
        if not _TIME_PATTERN.fullmatch(self.time):
            raise ValueError("time must use HH:MM format")
        return self


class TaskMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: Literal["inbox", "active", "done", "cancelled"] = "inbox"
    scheduled_at: str | None = None
    ends_at: str | None = None
    planned_duration_minutes: int | None = Field(default=None, ge=1)
    deadline: str | None = None
    project: str | None = None
    parent_id: str | None = None
    recurrence: TaskRecurrenceRule | None = None
    recurrence_exceptions: dict[str, Literal["skipped"]] = Field(default_factory=dict)
    skipped_weeks: list[str] = Field(default_factory=list)

    @field_validator("deadline")
    @classmethod
    def validate_deadline(cls, value: str | None) -> str | None:
        return _validate_iso_date_or_datetime(value, field_name="deadline")

    @field_validator("scheduled_at")
    @classmethod
    def validate_scheduled_at(cls, value: str | None) -> str | None:
        return _validate_iso_date_or_datetime(value, field_name="scheduled_at")

    @field_validator("ends_at")
    @classmethod
    def validate_ends_at(cls, value: str | None) -> str | None:
        return _validate_iso_date_or_datetime(value, field_name="ends_at")

    @model_validator(mode="after")
    def validate_task_range(self) -> "TaskMetadata":
        if self.scheduled_at and self.ends_at and _sortable_datetime(self.ends_at) <= _sortable_datetime(
            self.scheduled_at
        ):
            raise ValueError("ends_at must be after scheduled_at")
        return self

    @field_validator("skipped_weeks")
    @classmethod
    def validate_skipped_weeks(cls, value: list[str]) -> list[str]:
        for item in value:
            _validate_iso_date(item, field_name="skipped_weeks")
        return sorted(set(value))


class ReminderMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    remind_at: str | None = None
    target_entry_id: str | None = None
    target_entry_type: str | None = None
    target_title: str | None = None
    status: Literal["scheduled", "done", "cancelled"] = "scheduled"

    @field_validator("remind_at")
    @classmethod
    def validate_remind_at(cls, value: str | None) -> str | None:
        return _validate_iso_date_or_datetime(value, field_name="remind_at")


class EventMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    starts_at: str = Field(min_length=1)
    ends_at: str | None = None
    location: str | None = None
    status: Literal["tracking", "attending", "skipped", "cancelled"] = "tracking"
    source_url: str | None = None
    linked_entry_ids: list[str] = Field(default_factory=list)
    reminder_id: str | None = None
    reminder_at: str | None = None
    reminder_text: str | None = None

    @field_validator("starts_at")
    @classmethod
    def validate_starts_at(cls, value: str) -> str:
        cleaned = _validate_iso_date_or_datetime(value, field_name="starts_at")
        if cleaned is None:
            raise ValueError("starts_at is required")
        return cleaned

    @field_validator("ends_at")
    @classmethod
    def validate_ends_at(cls, value: str | None) -> str | None:
        return _validate_iso_date_or_datetime(value, field_name="ends_at")

    @field_validator("reminder_at")
    @classmethod
    def validate_reminder_at(cls, value: str | None) -> str | None:
        return _validate_iso_date_or_datetime(value, field_name="reminder_at")

    @model_validator(mode="after")
    def validate_event_range(self) -> "EventMetadata":
        if self.ends_at and _sortable_datetime(self.ends_at) < _sortable_datetime(self.starts_at):
            raise ValueError("ends_at must be after starts_at")
        return self


class FinanceMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    amount: float = Field(gt=0)
    direction: Literal["income", "expense"]
    currency: str = Field(default="RUB", min_length=3, max_length=3)
    description: str | None = None
    kind: Literal["expense", "income", "transfer"] | None = None
    category: str | None = None
    account_id: str | None = None
    bank: str | None = None
    transaction_date: str | None = None
    counterparty: str | None = None
    external_id: str | None = None
    import_batch_id: str | None = None
    ai_confidence: float | None = Field(default=None, ge=0, le=1)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("transaction_date")
    @classmethod
    def validate_transaction_date(cls, value: str | None) -> str | None:
        return _validate_iso_date_or_datetime(value, field_name="transaction_date")


class HabitRegularity(BaseModel):
    model_config = ConfigDict(extra="allow")

    kind: Literal["daily", "weekdays", "weekly_target", "monthly_target"] = "daily"
    weekdays: list[int] = Field(default_factory=list)
    target: int | None = None

    @model_validator(mode="after")
    def validate_regularity(self) -> "HabitRegularity":
        if self.kind == "weekdays":
            unique_days = sorted(set(self.weekdays))
            if not unique_days:
                raise ValueError("weekdays must include at least one day")
            if any(day < 1 or day > 7 for day in unique_days):
                raise ValueError("weekdays must use 1..7")
            self.weekdays = unique_days
            self.target = None
            return self

        self.weekdays = []
        if self.kind == "weekly_target":
            if self.target is None or self.target < 1 or self.target > 7:
                raise ValueError("weekly target must be 1..7")
            return self
        if self.kind == "monthly_target":
            if self.target is None or self.target < 1 or self.target > 31:
                raise ValueError("monthly target must be 1..31")
            return self

        self.target = None
        return self


class HabitMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    stage: Literal["desired", "tracking", "automatic", "archived"] = "desired"
    regularity: HabitRegularity = Field(default_factory=HabitRegularity)
    logs: dict[str, Literal["done", "skip", "rest"]] = Field(default_factory=dict)

    @field_validator("logs")
    @classmethod
    def validate_logs(cls, value: dict[str, str]) -> dict[str, str]:
        for day in value:
            _validate_iso_date(day, field_name="logs date")
        return value


class PersonMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    full_name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    birthday: str | None = None
    contacts: list[str] = Field(default_factory=list)
    notes: str | None = None

    @field_validator("birthday")
    @classmethod
    def validate_birthday(cls, value: str | None) -> str | None:
        return _validate_iso_date(value, field_name="birthday")


class DiaryMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    mode: Literal["diary"] = "diary"
    entry_date: str = Field(default_factory=lambda: _default_user_date(), pattern=r"^\d{4}-\d{2}-\d{2}$")

    @field_validator("entry_date", mode="before")
    @classmethod
    def default_entry_date(cls, value: str | None) -> str:
        cleaned = _clean_optional_string(value)
        return cleaned or _default_user_date()

    @field_validator("entry_date")
    @classmethod
    def validate_entry_date(cls, value: str) -> str:
        return _validate_iso_date(value, field_name="entry_date")


class ResourceFileMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    key: str = Field(min_length=1)
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(default="application/octet-stream", min_length=1, max_length=255)
    size: int = Field(ge=0)
    storage: str = Field(default="local", min_length=1, max_length=64)


class ResourceMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    description: str | None = None
    file: ResourceFileMetadata | None = None


def _clean_optional_string(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _validate_iso_date(value: str | None, *, field_name: str) -> str | None:
    cleaned = _clean_optional_string(value)
    if cleaned is None:
        return None
    try:
        date.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be a valid ISO date: YYYY-MM-DD") from exc
    return cleaned


def _validate_iso_date_or_datetime(value: str | None, *, field_name: str) -> str | None:
    cleaned = _clean_optional_string(value)
    if cleaned is None:
        return None
    try:
        if "T" in cleaned or " " in cleaned:
            datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        else:
            date.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be a valid ISO date or datetime") from exc
    return cleaned


def _sortable_datetime(value: str) -> datetime:
    if "T" not in value and " " not in value:
        parsed = datetime.combine(date.fromisoformat(value), time.min)
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        return parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def _default_user_date() -> str:
    try:
        now = datetime.now(ZoneInfo(settings.user_timezone))
    except ZoneInfoNotFoundError:
        now = datetime.now(UTC)
    return now.date().isoformat()


def normalize_metadata(entry_type: EntryType, metadata: dict[str, Any]) -> dict[str, Any]:
    if entry_type == EntryType.task:
        return TaskMetadata.model_validate(metadata).model_dump()
    if entry_type == EntryType.reminder:
        return ReminderMetadata.model_validate(metadata).model_dump()
    if entry_type == EntryType.event:
        return EventMetadata.model_validate(metadata).model_dump()
    if entry_type == EntryType.finance:
        return FinanceMetadata.model_validate(metadata).model_dump()
    if entry_type == EntryType.habit:
        return HabitMetadata.model_validate(metadata).model_dump(exclude_none=True)
    if entry_type == EntryType.person:
        return PersonMetadata.model_validate(metadata).model_dump()
    if entry_type == EntryType.diary:
        return DiaryMetadata.model_validate(metadata).model_dump(exclude_none=True)
    if entry_type == EntryType.resource:
        return ResourceMetadata.model_validate(metadata).model_dump(exclude_none=True)
    return metadata
