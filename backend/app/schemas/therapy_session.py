from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class TherapyProblemItem(BaseModel):
    thesis: str = Field(min_length=1)
    evidence: str = Field(min_length=1)
    speaker: Literal["client", "therapist", "unknown"] = "client"


class TherapyDefenseMechanism(BaseModel):
    name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    evidence: str = Field(min_length=1)
    speaker: Literal["client", "therapist", "unknown"] = "client"


class TherapySessionAnalysis(BaseModel):
    session_summary: str = Field(min_length=1)
    key_topics: list[str] = Field(default_factory=list)
    problems: list[TherapyProblemItem] = Field(default_factory=list)
    defense_mechanisms: list[TherapyDefenseMechanism] = Field(default_factory=list)
    emotional_dynamics: str = ""
    client_patterns: list[str] = Field(default_factory=list)
    therapist_interventions: list[str] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)
    homework_or_next_steps: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    confidence_notes: str = ""


class TherapySessionJobRead(BaseModel):
    id: int
    title: str
    session_date: date | None
    status: str
    stage: str
    stage_key: str
    progress: int
    source_filename: str
    duration_sec: int
    transcription_source: str
    transcript: str
    diarized_transcript: str
    speakers_json: dict[str, Any]
    analysis_json: dict[str, Any]
    analysis_markdown: str
    analysis_model: str
    error: str
    entry_id: str | None
    created_at: datetime
    updated_at: datetime


class TherapySessionJobSummary(BaseModel):
    id: int
    title: str
    session_date: date | None
    status: str
    stage: str
    stage_key: str
    progress: int
    source_filename: str
    duration_sec: int
    error: str
    created_at: datetime
    updated_at: datetime


class TherapySessionTextCreate(BaseModel):
    text: str = Field(min_length=20, max_length=500_000)
    title: str = Field(default="", max_length=500)
    session_date: date | None = None


class TherapySessionStatusRead(BaseModel):
    id: int
    status: str
    stage: str
    stage_key: str
    progress: int
    error: str
