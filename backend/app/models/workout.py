from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.types import GUID


class ExerciseCatalog(Base):
    __tablename__ = "exercise_catalog"
    __table_args__ = (
        UniqueConstraint("user_id", "name", "muscle_group", name="uq_exercise_catalog_user_name_group"),
        Index("ix_exercise_catalog_user_muscle_group", "user_id", "muscle_group"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    muscle_group: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="exercise_catalog_items")
    workout_exercises = relationship("WorkoutExercise", back_populates="exercise")
    personal_records = relationship("PersonalRecord", back_populates="exercise")


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (Index("ix_workout_sessions_user_date", "user_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    body_weight: Mapped[float] = mapped_column(Float, nullable=False)
    mood: Mapped[int] = mapped_column(Integer, nullable=False)
    muscle_readiness: Mapped[int] = mapped_column(Integer, nullable=False)
    sleep_quality: Mapped[int] = mapped_column(Integer, nullable=False)
    general_fatigue: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", back_populates="workout_sessions")
    exercises = relationship(
        "WorkoutExercise",
        back_populates="workout",
        cascade="all, delete-orphan",
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"
    __table_args__ = (
        Index("ix_workout_exercises_workout_id", "workout_id"),
        Index("ix_workout_exercises_exercise_catalog_id", "exercise_catalog_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    workout_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("workout_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    exercise_catalog_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("exercise_catalog.id", ondelete="CASCADE"),
        nullable=False,
    )
    sets: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list, server_default="[]")

    workout = relationship("WorkoutSession", back_populates="exercises")
    exercise = relationship("ExerciseCatalog", back_populates="workout_exercises")


class PersonalRecord(Base):
    __tablename__ = "personal_records"
    __table_args__ = (Index("ix_personal_records_user_exercise", "user_id", "exercise_catalog_id"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    exercise_catalog_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("exercise_catalog.id", ondelete="CASCADE"),
        nullable=False,
    )
    weight: Mapped[float] = mapped_column(Float, nullable=False)
    reps: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    user = relationship("User", back_populates="personal_records")
    exercise = relationship("ExerciseCatalog", back_populates="personal_records")
