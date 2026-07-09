"""Вспомогательные функции для чатов."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from transcription.models import Chat, Job, User


def ensure_chats_for_user(db: Session, user: User) -> None:
    """Создаёт Chat для старых Job, у которых ещё нет чата."""
    existing_job_ids = {
        row[0]
        for row in db.query(Chat.job_id).filter(Chat.user_id == user.id).all()
    }
    jobs = db.query(Job).filter(Job.user_id == user.id).order_by(Job.created_at.desc()).all()
    created = False
    for job in jobs:
        if job.id not in existing_job_ids:
            db.add(
                Chat(
                    user_id=user.id,
                    job_id=job.id,
                    title=job.title or job.url,
                )
            )
            created = True
    if created:
        db.commit()


def get_user_chats(db: Session, user: User) -> list[Chat]:
    return (
        db.query(Chat)
        .options(joinedload(Chat.job))
        .filter(Chat.user_id == user.id)
        .order_by(Chat.updated_at.desc())
        .all()
    )


def get_owned_chat(chat_id: int, user: User, db: Session) -> Chat | None:
    chat = (
        db.query(Chat)
        .options(joinedload(Chat.job))
        .filter(Chat.id == chat_id, Chat.user_id == user.id)
        .first()
    )
    return chat


def get_chat_for_job(job_id: int, user: User, db: Session) -> Chat | None:
    return (
        db.query(Chat)
        .filter(Chat.job_id == job_id, Chat.user_id == user.id)
        .first()
    )
