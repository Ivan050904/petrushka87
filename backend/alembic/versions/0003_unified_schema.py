"""unified schema: transcription, links, assistant, embeddings

Revision ID: 0003_unified_schema
Revises: 0002_entry_updated_at_index
Create Date: 2026-07-09 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_unified_schema"
down_revision = "0002_entry_updated_at_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transcription_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=True),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("title", sa.String(length=500), server_default="", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("stage", sa.String(length=100), server_default="В очереди", nullable=False),
        sa.Column("stage_key", sa.String(length=30), server_default="metadata", nullable=False),
        sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
        sa.Column("source", sa.String(length=20), server_default="", nullable=False),
        sa.Column("reprocess_mode", sa.String(length=10), server_default="", nullable=False),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_sec", sa.Integer(), server_default="0", nullable=False),
        sa.Column("summary_model", sa.String(length=100), server_default="", nullable=False),
        sa.Column("transcript", sa.Text(), server_default="", nullable=False),
        sa.Column("summary", sa.Text(), server_default="", nullable=False),
        sa.Column("opinions", sa.Text(), server_default="", nullable=False),
        sa.Column("error", sa.Text(), server_default="", nullable=False),
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
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcription_jobs_created_at"), "transcription_jobs", ["created_at"], unique=False)
    op.create_index(op.f("ix_transcription_jobs_entry_id"), "transcription_jobs", ["entry_id"], unique=False)
    op.create_index(op.f("ix_transcription_jobs_status"), "transcription_jobs", ["status"], unique=False)
    op.create_index(op.f("ix_transcription_jobs_user_id"), "transcription_jobs", ["user_id"], unique=False)

    op.create_table(
        "transcription_chats",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), server_default="", nullable=False),
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
        sa.ForeignKeyConstraint(["job_id"], ["transcription_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transcription_chats_created_at"), "transcription_chats", ["created_at"], unique=False)
    op.create_index(op.f("ix_transcription_chats_job_id"), "transcription_chats", ["job_id"], unique=True)
    op.create_index(op.f("ix_transcription_chats_user_id"), "transcription_chats", ["user_id"], unique=False)

    op.create_table(
        "transcription_chat_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("chat_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["chat_id"], ["transcription_chats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_transcription_chat_messages_chat_id"),
        "transcription_chat_messages",
        ["chat_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_transcription_chat_messages_created_at"),
        "transcription_chat_messages",
        ["created_at"],
        unique=False,
    )

    op.create_table(
        "entry_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("source_entry_id", sa.String(length=36), nullable=False),
        sa.Column("target_entry_id", sa.String(length=36), nullable=False),
        sa.Column("link_type", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["source_entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_entry_id", "target_entry_id", "link_type", name="uq_entry_links_edge"),
    )
    op.create_index(op.f("ix_entry_links_link_type"), "entry_links", ["link_type"], unique=False)
    op.create_index(op.f("ix_entry_links_source_entry_id"), "entry_links", ["source_entry_id"], unique=False)
    op.create_index(op.f("ix_entry_links_target_entry_id"), "entry_links", ["target_entry_id"], unique=False)
    op.create_index(op.f("ix_entry_links_user_id"), "entry_links", ["user_id"], unique=False)

    op.create_table(
        "assistant_conversations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=200), server_default="Новый диалог", nullable=False),
        sa.Column("scope", sa.String(length=32), server_default="all", nullable=False),
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
        op.f("ix_assistant_conversations_created_at"),
        "assistant_conversations",
        ["created_at"],
        unique=False,
    )
    op.create_index(op.f("ix_assistant_conversations_user_id"), "assistant_conversations", ["user_id"], unique=False)

    op.create_table(
        "assistant_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["assistant_conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_assistant_messages_conversation_id"), "assistant_messages", ["conversation_id"], unique=False)
    op.create_index(op.f("ix_assistant_messages_created_at"), "assistant_messages", ["created_at"], unique=False)

    op.create_table(
        "entry_embeddings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), server_default="0", nullable=False),
        sa.Column("source_type", sa.String(length=32), server_default="entry", nullable=False),
        sa.Column("text_snippet", sa.Text(), nullable=False),
        sa.Column("vector", sa.JSON(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["entry_id"], ["entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entry_id", "chunk_index", name="uq_entry_embeddings_chunk"),
    )
    op.create_index(op.f("ix_entry_embeddings_entry_id"), "entry_embeddings", ["entry_id"], unique=False)
    op.create_index(op.f("ix_entry_embeddings_user_id"), "entry_embeddings", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_entry_embeddings_user_id"), table_name="entry_embeddings")
    op.drop_index(op.f("ix_entry_embeddings_entry_id"), table_name="entry_embeddings")
    op.drop_table("entry_embeddings")

    op.drop_index(op.f("ix_assistant_messages_created_at"), table_name="assistant_messages")
    op.drop_index(op.f("ix_assistant_messages_conversation_id"), table_name="assistant_messages")
    op.drop_table("assistant_messages")

    op.drop_index(op.f("ix_assistant_conversations_user_id"), table_name="assistant_conversations")
    op.drop_index(op.f("ix_assistant_conversations_created_at"), table_name="assistant_conversations")
    op.drop_table("assistant_conversations")

    op.drop_index(op.f("ix_entry_links_user_id"), table_name="entry_links")
    op.drop_index(op.f("ix_entry_links_target_entry_id"), table_name="entry_links")
    op.drop_index(op.f("ix_entry_links_source_entry_id"), table_name="entry_links")
    op.drop_index(op.f("ix_entry_links_link_type"), table_name="entry_links")
    op.drop_table("entry_links")

    op.drop_index(op.f("ix_transcription_chat_messages_created_at"), table_name="transcription_chat_messages")
    op.drop_index(op.f("ix_transcription_chat_messages_chat_id"), table_name="transcription_chat_messages")
    op.drop_table("transcription_chat_messages")

    op.drop_index(op.f("ix_transcription_chats_user_id"), table_name="transcription_chats")
    op.drop_index(op.f("ix_transcription_chats_job_id"), table_name="transcription_chats")
    op.drop_index(op.f("ix_transcription_chats_created_at"), table_name="transcription_chats")
    op.drop_table("transcription_chats")

    op.drop_index(op.f("ix_transcription_jobs_user_id"), table_name="transcription_jobs")
    op.drop_index(op.f("ix_transcription_jobs_status"), table_name="transcription_jobs")
    op.drop_index(op.f("ix_transcription_jobs_entry_id"), table_name="transcription_jobs")
    op.drop_index(op.f("ix_transcription_jobs_created_at"), table_name="transcription_jobs")
    op.drop_table("transcription_jobs")
