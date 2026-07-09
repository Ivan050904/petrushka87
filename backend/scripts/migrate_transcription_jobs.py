"""Migrate legacy transcription jobs.db into the main application database."""

from __future__ import annotations

import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings
from app.db.session import SessionLocal
import app.models  # noqa: F401
from app.models.transcription import TranscriptionChat, TranscriptionChatMessage, TranscriptionJob
from app.models.user import User
from app.services.transcription.entry_sync import sync_entry_for_job
from transcription.config import settings as transcription_settings


def _load_email_map(db) -> dict[str, uuid.UUID]:
    users = db.query(User).all()
    return {user.email.strip().lower(): user.id for user in users}


def _parse_dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def migrate() -> None:
    legacy_path = transcription_settings.db_path
    if not legacy_path.exists():
        print(f"Legacy database not found: {legacy_path}")
        return

    conn = sqlite3.connect(legacy_path)
    conn.row_factory = sqlite3.Row
    try:
        legacy_users = {
            int(row["id"]): str(row["email"]).strip().lower()
            for row in conn.execute("SELECT id, email FROM users")
        }
        legacy_jobs = list(conn.execute("SELECT * FROM jobs ORDER BY id"))
        legacy_chats = list(conn.execute("SELECT * FROM chats ORDER BY id"))
        legacy_messages = list(conn.execute("SELECT * FROM chat_messages ORDER BY id"))
    finally:
        conn.close()

    db = SessionLocal()
    migrated_jobs = 0
    legacy_to_new_job: dict[int, int] = {}
    legacy_to_new_chat: dict[int, int] = {}
    try:
        email_to_uuid = _load_email_map(db)

        for row in legacy_jobs:
            legacy_user_id = int(row["user_id"])
            email = legacy_users.get(legacy_user_id)
            if not email:
                continue
            user_id = email_to_uuid.get(email)
            if user_id is None:
                continue

            existing = db.query(TranscriptionJob).filter(
                TranscriptionJob.user_id == user_id,
                TranscriptionJob.url == row["url"],
            ).first()
            if existing is not None:
                legacy_to_new_job[int(row["id"])] = existing.id
                continue

            job = TranscriptionJob(
                user_id=user_id,
                url=row["url"],
                title=row["title"] or "",
                status=row["status"] or "queued",
                stage=row["stage"] or "",
                stage_key=row["stage_key"] or "metadata",
                progress=int(row["progress"] or 0),
                source=row["source"] or "",
                reprocess_mode=row["reprocess_mode"] or "",
                processing_started_at=_parse_dt(row["processing_started_at"]),
                duration_sec=int(row["duration_sec"] or 0),
                summary_model=row["summary_model"] or "",
                transcript=row["transcript"] or "",
                summary=row["summary"] or "",
                opinions=row["opinions"] or "",
                error=row["error"] or "",
                created_at=_parse_dt(row["created_at"]) or datetime.now(),
                updated_at=_parse_dt(row["updated_at"]) or datetime.now(),
            )
            db.add(job)
            db.flush()
            legacy_to_new_job[int(row["id"])] = job.id
            if job.status == "done":
                sync_entry_for_job(db, job)
            migrated_jobs += 1

        for row in legacy_chats:
            legacy_job_id = int(row["job_id"])
            new_job_id = legacy_to_new_job.get(legacy_job_id)
            if new_job_id is None:
                continue
            legacy_user_id = int(row["user_id"])
            email = legacy_users.get(legacy_user_id)
            user_id = email_to_uuid.get(email or "")
            if user_id is None:
                continue

            existing_chat = db.query(TranscriptionChat).filter(TranscriptionChat.job_id == new_job_id).first()
            if existing_chat is not None:
                legacy_to_new_chat[int(row["id"])] = existing_chat.id
                continue

            chat = TranscriptionChat(
                user_id=user_id,
                job_id=new_job_id,
                title=row["title"] or "",
                created_at=_parse_dt(row["created_at"]) or datetime.now(),
                updated_at=_parse_dt(row["updated_at"]) or datetime.now(),
            )
            db.add(chat)
            db.flush()
            legacy_to_new_chat[int(row["id"])] = chat.id

        for message_row in legacy_messages:
            new_chat_id = legacy_to_new_chat.get(int(message_row["chat_id"]))
            if new_chat_id is None:
                continue
            db.add(
                TranscriptionChatMessage(
                    chat_id=new_chat_id,
                    role=message_row["role"],
                    content=message_row["content"],
                    created_at=_parse_dt(message_row["created_at"]) or datetime.now(),
                )
            )

        db.commit()
        print(f"Migrated jobs: {migrated_jobs}")
        print(f"Target database: {settings.database_url}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
