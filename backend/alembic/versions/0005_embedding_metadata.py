"""entry_embeddings metadata columns for scoped RAG search

Revision ID: 0005_embedding_metadata
Revises: 0004_assistant_agent_sessions
Create Date: 2026-07-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_embedding_metadata"
down_revision = "0004_assistant_agent_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("entry_embeddings") as batch_op:
        batch_op.add_column(sa.Column("entry_type", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("scope", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("collection", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("entry_date", sa.String(length=10), nullable=True))
        batch_op.create_index("ix_entry_embeddings_scope", ["scope"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("entry_embeddings") as batch_op:
        batch_op.drop_index("ix_entry_embeddings_scope")
        batch_op.drop_column("entry_date")
        batch_op.drop_column("collection")
        batch_op.drop_column("scope")
        batch_op.drop_column("entry_type")
