"""Workout tables: exercise catalog, sessions, exercises, personal records."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_workout_tables"
down_revision = "0006_therapy_session_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exercise_catalog",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("muscle_group", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", "muscle_group", name="uq_exercise_catalog_user_name_group"),
    )
    op.create_index("ix_exercise_catalog_user_muscle_group", "exercise_catalog", ["user_id", "muscle_group"])

    op.create_table(
        "workout_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("body_weight", sa.Float(), nullable=False),
        sa.Column("mood", sa.Integer(), nullable=False),
        sa.Column("muscle_readiness", sa.Integer(), nullable=False),
        sa.Column("sleep_quality", sa.Integer(), nullable=False),
        sa.Column("general_fatigue", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("body_weight > 0", name="ck_workout_sessions_body_weight_positive"),
        sa.CheckConstraint("mood BETWEEN 1 AND 10", name="ck_workout_sessions_mood_range"),
        sa.CheckConstraint("muscle_readiness BETWEEN 1 AND 10", name="ck_workout_sessions_muscle_readiness_range"),
        sa.CheckConstraint("sleep_quality BETWEEN 1 AND 10", name="ck_workout_sessions_sleep_quality_range"),
        sa.CheckConstraint("general_fatigue BETWEEN 1 AND 10", name="ck_workout_sessions_general_fatigue_range"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_sessions_user_date", "workout_sessions", ["user_id", "date"])

    op.create_table(
        "workout_exercises",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workout_id", sa.String(length=36), nullable=False),
        sa.Column("exercise_catalog_id", sa.String(length=36), nullable=False),
        sa.Column("sets", sa.JSON(), server_default="[]", nullable=False),
        sa.ForeignKeyConstraint(["exercise_catalog_id"], ["exercise_catalog.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workout_id"], ["workout_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_exercises_workout_id", "workout_exercises", ["workout_id"])
    op.create_index("ix_workout_exercises_exercise_catalog_id", "workout_exercises", ["exercise_catalog_id"])

    op.create_table(
        "personal_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("exercise_catalog_id", sa.String(length=36), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("weight > 0", name="ck_personal_records_weight_positive"),
        sa.CheckConstraint("reps > 0", name="ck_personal_records_reps_positive"),
        sa.ForeignKeyConstraint(["exercise_catalog_id"], ["exercise_catalog.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_personal_records_user_exercise", "personal_records", ["user_id", "exercise_catalog_id"])


def downgrade() -> None:
    op.drop_index("ix_personal_records_user_exercise", table_name="personal_records")
    op.drop_table("personal_records")
    op.drop_index("ix_workout_exercises_exercise_catalog_id", table_name="workout_exercises")
    op.drop_index("ix_workout_exercises_workout_id", table_name="workout_exercises")
    op.drop_table("workout_exercises")
    op.drop_index("ix_workout_sessions_user_date", table_name="workout_sessions")
    op.drop_table("workout_sessions")
    op.drop_index("ix_exercise_catalog_user_muscle_group", table_name="exercise_catalog")
    op.drop_table("exercise_catalog")
