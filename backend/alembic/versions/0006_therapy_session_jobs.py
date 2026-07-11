"""therapy_session_jobs table

Revision ID: 0006_therapy_session_jobs
Revises: 0005_embedding_metadata
Create Date: 2026-07-11 06:30:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_therapy_session_jobs"
down_revision = "0005_embedding_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "therapy_session_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=True),
        sa.Column("title", sa.String(length=500), server_default="", nullable=False),
        sa.Column("session_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("stage", sa.String(length=100), server_default="В очереди", nullable=False),
        sa.Column("stage_key", sa.String(length=30), server_default="upload", nullable=False),
        sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reprocess_mode", sa.String(length=10), server_default="", nullable=False),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_filename", sa.String(length=500), server_default="", nullable=False),
        sa.Column("file_storage_key", sa.String(length=500), server_default="", nullable=False),
        sa.Column("duration_sec", sa.Integer(), server_default="0", nullable=False),
        sa.Column("transcription_source", sa.String(length=30), server_default="", nullable=False),
        sa.Column("transcript", sa.Text(), server_default="", nullable=False),
        sa.Column("diarized_transcript", sa.Text(), server_default="", nullable=False),
        sa.Column("speakers_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("analysis_json", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("analysis_markdown", sa.Text(), server_default="", nullable=False),
        sa.Column("analysis_model", sa.String(length=100), server_default="", nullable=False),
        sa.Column("error", sa.Text(), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_therapy_session_jobs_user_id", "therapy_session_jobs", ["user_id"])
    op.create_index("ix_therapy_session_jobs_entry_id", "therapy_session_jobs", ["entry_id"])
    op.create_index("ix_therapy_session_jobs_status", "therapy_session_jobs", ["status"])
    op.create_index("ix_therapy_session_jobs_created_at", "therapy_session_jobs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_therapy_session_jobs_created_at", table_name="therapy_session_jobs")
    op.drop_index("ix_therapy_session_jobs_status", table_name="therapy_session_jobs")
    op.drop_index("ix_therapy_session_jobs_entry_id", table_name="therapy_session_jobs")
    op.drop_index("ix_therapy_session_jobs_user_id", table_name="therapy_session_jobs")
    op.drop_table("therapy_session_jobs")
