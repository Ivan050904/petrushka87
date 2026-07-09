from __future__ import annotations

import json
import uuid
from collections.abc import Callable, Iterator
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.assistant import AssistantConversation, AssistantMessage
from app.services.ai.analyze import answer_stream
from app.services.context.user_context import ContextScope, UserContext, build_user_context


def list_conversations(db: Session, user_id: uuid.UUID) -> list[AssistantConversation]:
    return list(
        db.scalars(
            select(AssistantConversation)
            .where(AssistantConversation.user_id == user_id)
            .order_by(AssistantConversation.updated_at.desc())
        ).all()
    )


def get_conversation(db: Session, user_id: uuid.UUID, conversation_id: uuid.UUID) -> AssistantConversation | None:
    conversation = db.get(AssistantConversation, conversation_id)
    if conversation is None or conversation.user_id != user_id:
        return None
    return conversation


def create_conversation(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str = "Новый диалог",
    scope: ContextScope = "all",
) -> AssistantConversation:
    conversation = AssistantConversation(user_id=user_id, title=title, scope=scope)
    db.add(conversation)
    db.flush()
    return conversation


def add_message(
    db: Session,
    *,
    conversation: AssistantConversation,
    role: str,
    content: str,
) -> AssistantMessage:
    message = AssistantMessage(conversation_id=conversation.id, role=role, content=content)
    db.add(message)
    conversation.updated_at = datetime.now(UTC)
    db.add(conversation)
    db.flush()
    return message


def stream_assistant_reply(
    db: Session,
    *,
    user_id: uuid.UUID,
    conversation: AssistantConversation,
    query: str,
) -> Iterator[str]:
    context = build_user_context(
        db,
        user_id,
        query,
        scope=conversation.scope,  # type: ignore[arg-type]
        limit=20,
    )
    history = [
        {"role": message.role, "content": message.content}
        for message in conversation.messages
    ]
    yield from answer_stream(query=query, history=history, context=context)


def sse_events(stream: Iterator[str], *, on_done: Callable[[], dict | None] | None = None) -> Iterator[str]:
    try:
        for delta in stream:
            yield f"event: token\ndata: {json.dumps({'text': delta}, ensure_ascii=False)}\n\n"
        if on_done is not None:
            payload = on_done()
            if payload is not None:
                yield f"event: done\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
    except Exception as exc:  # noqa: BLE001
        yield f"event: error\ndata: {json.dumps({'message': str(exc)}, ensure_ascii=False)}\n\n"
