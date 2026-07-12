"""SQLite FTS5 index for full-text entity search over entries."""

from __future__ import annotations

from alembic import op

revision = "0009_entries_fts"
down_revision = "0008_workout_entry_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
            entry_id UNINDEXED,
            user_id UNINDEXED,
            title,
            content,
            entry_type UNINDEXED,
            entry_date UNINDEXED,
            tokenize='unicode61'
        )
        """
    )
    op.execute(
        """
        CREATE TRIGGER IF NOT EXISTS entries_fts_ai AFTER INSERT ON entries BEGIN
            INSERT INTO entries_fts(entry_id, user_id, title, content, entry_type, entry_date)
            VALUES (
                new.id,
                new.user_id,
                coalesce(new.title, ''),
                coalesce(new.content, ''),
                coalesce(new.type, ''),
                coalesce(json_extract(new.metadata, '$.entry_date'), '')
            );
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER IF NOT EXISTS entries_fts_ad AFTER DELETE ON entries BEGIN
            DELETE FROM entries_fts WHERE entry_id = old.id;
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER IF NOT EXISTS entries_fts_au AFTER UPDATE ON entries BEGIN
            DELETE FROM entries_fts WHERE entry_id = old.id;
            INSERT INTO entries_fts(entry_id, user_id, title, content, entry_type, entry_date)
            VALUES (
                new.id,
                new.user_id,
                coalesce(new.title, ''),
                coalesce(new.content, ''),
                coalesce(new.type, ''),
                coalesce(json_extract(new.metadata, '$.entry_date'), '')
            );
        END
        """
    )
    op.execute(
        """
        INSERT INTO entries_fts(entry_id, user_id, title, content, entry_type, entry_date)
        SELECT
            id,
            user_id,
            coalesce(title, ''),
            coalesce(content, ''),
            coalesce(type, ''),
            coalesce(json_extract(metadata, '$.entry_date'), '')
        FROM entries
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS entries_fts_au")
    op.execute("DROP TRIGGER IF EXISTS entries_fts_ad")
    op.execute("DROP TRIGGER IF EXISTS entries_fts_ai")
    op.execute("DROP TABLE IF EXISTS entries_fts")
