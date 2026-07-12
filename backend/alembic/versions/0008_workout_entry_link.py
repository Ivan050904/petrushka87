"""Link workout sessions to entries for unified RAG indexing."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008_workout_entry_link"
down_revision = "0007_workout_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workout_sessions") as batch_op:
        batch_op.add_column(sa.Column("entry_id", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_workout_sessions_entry_id",
            "entries",
            ["entry_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_workout_sessions_entry_id", ["entry_id"])


def downgrade() -> None:
    with op.batch_alter_table("workout_sessions") as batch_op:
        batch_op.drop_index("ix_workout_sessions_entry_id")
        batch_op.drop_constraint("fk_workout_sessions_entry_id", type_="foreignkey")
        batch_op.drop_column("entry_id")
