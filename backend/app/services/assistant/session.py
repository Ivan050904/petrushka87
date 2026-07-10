from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.assistant_session import AssistantSessionRecord
from app.services.assistant.schemas import AssistantMessage, AssistantSession, PendingAction


def new_session_id() -> str:
    return uuid.uuid4().hex


def load_session(db: Session, user_id: str, session_id: str) -> AssistantSession:
    record = db.get(AssistantSessionRecord, session_id)
    if record is None or str(record.user_id) != user_id:
        return AssistantSession(session_id=session_id, user_id=user_id)

    return AssistantSession(
        session_id=record.id,
        user_id=str(record.user_id),
        messages=[AssistantMessage.model_validate(item) for item in record.messages],
        pending=PendingAction.model_validate(record.pending) if record.pending else None,
        pending_confirmation=(
            PendingAction.model_validate(record.pending_confirmation)
            if record.pending_confirmation
            else None
        ),
    )


def save_session(db: Session, session: AssistantSession) -> None:
    max_history = max(2, settings.assistant_max_history)
    if len(session.messages) > max_history:
        session.messages = session.messages[-max_history:]

    record = db.get(AssistantSessionRecord, session.session_id)
    if record is None:
        record = AssistantSessionRecord(
            id=session.session_id,
            user_id=uuid.UUID(session.user_id),
        )
        db.add(record)

    record.messages = [item.model_dump(mode="json") for item in session.messages]
    record.pending = session.pending.model_dump(mode="json") if session.pending else None
    record.pending_confirmation = (
        session.pending_confirmation.model_dump(mode="json")
        if session.pending_confirmation
        else None
    )
    db.commit()


def append_message(session: AssistantSession, role: str, content: str) -> None:
    session.messages.append(AssistantMessage(role=role, content=content))


def set_pending(session: AssistantSession, pending: PendingAction | None) -> None:
    session.pending = pending


def set_pending_confirmation(session: AssistantSession, pending: PendingAction | None) -> None:
    session.pending_confirmation = pending
