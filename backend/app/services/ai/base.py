from __future__ import annotations

from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any, Literal, Protocol

from pydantic import BaseModel, Field, field_validator

from app.schemas.entry import EntryType

if TYPE_CHECKING:
    from app.services.ai.life_notes import LifeNoteAnalyzeResult

CLASSIFIABLE_ENTRY_TYPES = {
    EntryType.task,
    EntryType.event,
    EntryType.finance,
    EntryType.person,
    EntryType.note,
    EntryType.diary,
    EntryType.resource,
}


class AIUsage(BaseModel):
    provider: str
    model: str
    input_tokens: int = Field(default=0, ge=0)
    cached_input_tokens: int = Field(default=0, ge=0)
    tool_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    billable_input_tokens: int = Field(default=0, ge=0)
    currency: str = "RUB"
    cost_rub: float | None = Field(default=None, ge=0.0)
    input_cost_rub: float | None = Field(default=None, ge=0.0)
    cached_input_cost_rub: float | None = Field(default=None, ge=0.0)
    tool_cost_rub: float | None = Field(default=None, ge=0.0)
    output_cost_rub: float | None = Field(default=None, ge=0.0)
    pricing: dict[str, float] = Field(default_factory=dict)
    pricing_note: str | None = None


class EntryClassification(BaseModel):
    type: EntryType
    title: str | None = Field(default=None, max_length=160)
    metadata: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    usage: AIUsage | None = None

    @field_validator("type")
    @classmethod
    def validate_classifiable_type(cls, value: EntryType) -> EntryType:
        if value not in CLASSIFIABLE_ENTRY_TYPES:
            raise ValueError(f"{value.value} is not supported by AI classification yet")
        return value


class ParsedTaskCandidate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    status: Literal["inbox", "active", "done", "cancelled"] = "inbox"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    scheduled_at: str | None = None
    deadline: str | None = None
    planned_duration_minutes: int | None = Field(default=None, ge=0)
    actual_duration_minutes: int | None = Field(default=None, ge=0)
    reminder_at: str | None = None
    reminder_text: str | None = None
    recurrence: str | None = None
    tags: list[str] = Field(default_factory=list)
    assignee_name: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class TaskParseResult(BaseModel):
    tasks: list[ParsedTaskCandidate] = Field(default_factory=list)
    usage: AIUsage | None = None


class AIUnavailableError(RuntimeError):
    pass


class AIClient(Protocol):
    def classify_entry(self, content: str) -> EntryClassification:
        """Return a validated structured suggestion for an entry."""

    def parse_tasks(self, content: str) -> TaskParseResult:
        """Return task candidates extracted from free-form text."""

    def analyze_text(
        self,
        content: str,
        *,
        entry_date: str | None = None,
        context: Any | None = None,
    ) -> "LifeNoteAnalyzeResult":
        """Analyze note text with optional user context."""

    def answer(
        self,
        query: str,
        *,
        history: list[dict[str, str]],
        context: Any,
    ) -> AsyncIterator[str]:
        """Stream an assistant answer."""
