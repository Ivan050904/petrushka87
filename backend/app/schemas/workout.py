from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MuscleGroup(StrEnum):
    LEGS = "legs"
    SHOULDERS = "shoulders"
    BACK = "back"
    CHEST = "chest"
    BICEPS = "biceps"
    TRICEPS = "triceps"


MUSCLE_GROUP_LABELS: dict[MuscleGroup, str] = {
    MuscleGroup.LEGS: "Ноги",
    MuscleGroup.SHOULDERS: "Плечи",
    MuscleGroup.BACK: "Спина",
    MuscleGroup.CHEST: "Грудь",
    MuscleGroup.BICEPS: "Бицепс",
    MuscleGroup.TRICEPS: "Трицепс",
}


class WorkoutSet(BaseModel):
    weight: float = Field(gt=0)
    reps: int = Field(gt=0)


class ExerciseCatalogCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    muscle_group: MuscleGroup


class ExerciseCatalogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    muscle_group: MuscleGroup
    created_at: datetime


class ExerciseCatalogUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    muscle_group: MuscleGroup | None = None


class WorkoutExerciseCreate(BaseModel):
    exercise_catalog_id: UUID
    sets: list[WorkoutSet] = Field(min_length=1)


class WorkoutExerciseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    exercise_catalog_id: UUID
    sets: list[WorkoutSet]
    exercise_name: str | None = None
    muscle_group: MuscleGroup | None = None


class WorkoutSessionCreate(BaseModel):
    date: datetime | None = None
    body_weight: float = Field(gt=0)
    mood: int = Field(ge=1, le=10)
    muscle_readiness: int = Field(ge=1, le=10)
    sleep_quality: int = Field(ge=1, le=10)
    general_fatigue: int = Field(ge=1, le=10)
    exercises: list[WorkoutExerciseCreate] = Field(default_factory=list)


class WorkoutSessionUpdate(BaseModel):
    date: datetime | None = None
    body_weight: float | None = Field(default=None, gt=0)
    mood: int | None = Field(default=None, ge=1, le=10)
    muscle_readiness: int | None = Field(default=None, ge=1, le=10)
    sleep_quality: int | None = Field(default=None, ge=1, le=10)
    general_fatigue: int | None = Field(default=None, ge=1, le=10)
    exercises: list[WorkoutExerciseCreate] | None = None


class WorkoutSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    date: datetime
    body_weight: float
    mood: int
    muscle_readiness: int
    sleep_quality: int
    general_fatigue: int
    created_at: datetime
    updated_at: datetime
    exercises: list[WorkoutExerciseRead] = Field(default_factory=list)


class PersonalRecordCreate(BaseModel):
    exercise_catalog_id: UUID
    weight: float = Field(gt=0)
    reps: int = Field(gt=0)
    date: date


class PersonalRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    exercise_catalog_id: UUID
    weight: float
    reps: int
    date: date
    created_at: datetime
    exercise_name: str | None = None


class ExerciseProgressPoint(BaseModel):
    date: date
    max_weight: float


class MuscleGroupProgressPoint(BaseModel):
    date: date
    max_weight: float


class WorkoutSessionListResponse(BaseModel):
    items: list[WorkoutSessionRead]
    total: int


def validate_sets_json(sets: list[dict]) -> list[WorkoutSet]:
    return [WorkoutSet.model_validate(item) for item in sets]
