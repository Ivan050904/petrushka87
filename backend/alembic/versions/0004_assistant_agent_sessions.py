"""assistant agent sessions table

Revision ID: 0004_assistant_agent_sessions
Revises: 0003_unified_schema
Create Date: 2026-07-10 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_assistant_agent_sessions"
down_revision = "0003_unified_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("messages", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("pending", sa.JSON(), nullable=True),
        sa.Column("pending_confirmation", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_assistant_sessions_user_id"),
        "assistant_sessions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_assistant_sessions_updated_at"),
        "assistant_sessions",
        ["updated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_assistant_sessions_updated_at"), table_name="assistant_sessions")
    op.drop_index(op.f("ix_assistant_sessions_user_id"), table_name="assistant_sessions")
    op.drop_table("assistant_sessions")
