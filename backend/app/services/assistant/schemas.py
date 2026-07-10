from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class PendingAction(BaseModel):
    action: Literal["create_task", "create_event"]
    params: dict[str, Any] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)


class AssistantSession(BaseModel):
    session_id: str
    user_id: str
    messages: list[AssistantMessage] = Field(default_factory=list)
    pending: PendingAction | None = None
    pending_confirmation: PendingAction | None = None


class AssistantActionResult(BaseModel):
    type: Literal["task", "event"]
    title: str
    entry_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssistantModelDecision(BaseModel):
    reply: str = Field(min_length=1, max_length=4000)
    action: Literal[
        "none",
        "ask_user",
        "create_task",
        "create_event",
        "list_entries",
        "update_entry",
        "confirm_pending",
    ] = "none"
    params: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    session_id: str | None = Field(default=None, max_length=64)
    confirm: bool = False


class AssistantChatResponse(BaseModel):
    reply: str
    session_id: str
    configured: bool
    actions: list[AssistantActionResult] = Field(default_factory=list)
    pending_confirmation: PendingAction | None = None
    entries_preview: list[dict[str, Any]] = Field(default_factory=list)


class AssistantStatusResponse(BaseModel):
    enabled: bool
    configured: bool
    model: str
    base_url: str
    provider_reachable: bool
    auto_confirm: bool
    classification_enabled: bool
    classification_model: str
    speech_enabled: bool = False
    speech_configured: bool = False
    whisper_model: str = ""


class AssistantTranscribeResponse(BaseModel):
    text: str
