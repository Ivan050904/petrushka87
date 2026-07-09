"""add entry updated_at index

Revision ID: 0002_entry_updated_at_index
Revises: 0001_initial
Create Date: 2026-06-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "0002_entry_updated_at_index"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(op.f("ix_entries_updated_at"), "entries", ["updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_entries_updated_at"), table_name="entries")
