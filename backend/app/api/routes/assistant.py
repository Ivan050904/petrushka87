from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import SessionLocal, get_db
from app.models.user import User
from app.services.ai.base import AIUnavailableError
from app.services.assistant.chat import (
    add_message,
    create_conversation,
    get_conversation,
    list_conversations,
    stream_assistant_reply,
)

router = APIRouter()


class ConversationRead(BaseModel):
    id: uuid.UUID
    title: str
    scope: str
    created_at: datetime
    updated_at: datetime


class MessageRead(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class ConversationDetail(ConversationRead):
    messages: list[MessageRead]


class ConversationCreate(BaseModel):
    title: str = Field(default="Новый диалог", max_length=200)
    scope: str = Field(default="all", max_length=32)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)


@router.get("/conversations", response_model=list[ConversationRead])
def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConversationRead]:
    conversations = list_conversations(db, current_user.id)
    return [
        ConversationRead(
            id=item.id,
            title=item.title,
            scope=item.scope,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in conversations
    ]


@router.post("/conversations", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def post_conversation(
    payload: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationRead:
    conversation = create_conversation(
        db,
        user_id=current_user.id,
        title=payload.title,
        scope=payload.scope,  # type: ignore[arg-type]
    )
    db.commit()
    db.refresh(conversation)
    return ConversationRead(
        id=conversation.id,
        title=conversation.title,
        scope=conversation.scope,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation_detail(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetail:
    conversation = get_conversation(db, current_user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        scope=conversation.scope,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[
            MessageRead(
                id=message.id,
                role=message.role,
                content=message.content,
                created_at=message.created_at,
            )
            for message in conversation.messages
        ],
    )


@router.post("/conversations/{conversation_id}/chat")
def post_chat_stream(
    conversation_id: uuid.UUID,
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    conversation = get_conversation(db, current_user.id, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    question = payload.message.strip()
    add_message(db, conversation=conversation, role="user", content=question)
    db.commit()

    conversation_id_val = conversation.id
    user_id = current_user.id

    def event_stream():
        parts: list[str] = []
        try:
            stream_db = SessionLocal()
            try:
                live_conversation = get_conversation(stream_db, user_id, conversation_id_val)
                if live_conversation is None:
                    raise RuntimeError("Conversation not found")
                for delta in stream_assistant_reply(
                    stream_db,
                    user_id=user_id,
                    conversation=live_conversation,
                    query=question,
                ):
                    parts.append(delta)
                    yield f"event: token\ndata: {json.dumps({'text': delta}, ensure_ascii=False)}\n\n"
            finally:
                stream_db.close()

            answer = "".join(parts).strip()
            if not answer:
                raise AIUnavailableError("Empty assistant response")

            save_db = SessionLocal()
            try:
                save_conversation = get_conversation(save_db, user_id, conversation_id_val)
                if save_conversation is None:
                    raise RuntimeError("Conversation not found")
                assistant_message = add_message(
                    save_db,
                    conversation=save_conversation,
                    role="assistant",
                    content=answer,
                )
                save_db.commit()
                save_db.refresh(assistant_message)
                payload_done = {
                    "id": str(assistant_message.id),
                    "role": "assistant",
                    "content": answer,
                }
            finally:
                save_db.close()

            yield f"event: done\ndata: {json.dumps(payload_done, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"event: error\ndata: {json.dumps({'message': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
