from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import SessionLocal, get_db
from app.models.assistant import AssistantMessage
from app.models.user import User
from app.services.ai.base import AIUnavailableError
from app.services.assistant.agent import run_assistant_turn
from app.services.assistant.chat import (
    AssistantStreamMeta,
    add_message,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    stream_assistant_reply,
    update_conversation,
)
from app.services.assistant.llm import check_assistant_provider_health
from app.services.assistant.schemas import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantStatusResponse,
    AssistantTranscribeResponse,
)
from app.services.assistant.speech import (
    SpeechUnavailableError,
    speech_is_configured,
    transcribe_audio_bytes,
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


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)


@router.get("/status", response_model=AssistantStatusResponse)
def assistant_agent_status(
    current_user: User = Depends(get_current_user),
) -> AssistantStatusResponse:
    del current_user
    from app.services.assistant.llm import AssistantLLMClient

    client = AssistantLLMClient()
    configured = client.is_configured()
    return AssistantStatusResponse(
        enabled=settings.assistant_enabled,
        configured=configured,
        model=settings.assistant_model,
        base_url=settings.assistant_base_url,
        provider_reachable=check_assistant_provider_health() if configured else False,
        auto_confirm=settings.assistant_auto_confirm,
        classification_enabled=settings.ai_classification_enabled,
        classification_model=settings.openai_compatible_model,
        speech_enabled=settings.speech_enabled,
        speech_configured=speech_is_configured(),
        whisper_model=settings.whisper_model,
    )


@router.post("/transcribe", response_model=AssistantTranscribeResponse)
async def assistant_transcribe(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> AssistantTranscribeResponse:
    del current_user
    if not settings.speech_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech recognition is disabled",
        )

    audio_bytes = await audio.read()
    try:
        text = await run_in_threadpool(
            transcribe_audio_bytes,
            audio_bytes,
            content_type=audio.content_type,
            filename=audio.filename,
        )
    except SpeechUnavailableError as exc:
        message = str(exc)
        if "too large" in message.lower():
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message) from exc

    return AssistantTranscribeResponse(text=text)


@router.post("/agent/chat", response_model=AssistantChatResponse)
def assistant_agent_chat(
    payload: AssistantChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssistantChatResponse:
    if not settings.assistant_enabled:
        return AssistantChatResponse(
            reply=(
                "Ассистент-агент отключён. Установите ASSISTANT_ENABLED=true и "
                "ASSISTANT_API_KEY в backend/.env."
            ),
            session_id=payload.session_id or "disabled",
            configured=False,
        )

    try:
        return run_assistant_turn(
            db,
            user_id=current_user.id,
            message=payload.message,
            session_id=payload.session_id,
            confirm=payload.confirm,
        )
    except AIUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc) or exc.__class__.__name__,
        ) from exc


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


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    if not delete_conversation(db, current_user.id, conversation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/conversations/{conversation_id}", response_model=ConversationRead)
def patch_conversation(
    conversation_id: uuid.UUID,
    payload: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationRead:
    conversation = update_conversation(
        db,
        current_user.id,
        conversation_id,
        title=payload.title,
    )
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    db.commit()
    db.refresh(conversation)
    return ConversationRead(
        id=conversation.id,
        title=conversation.title,
        scope=conversation.scope,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
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
    user_message = add_message(db, conversation=conversation, role="user", content=question)
    user_message_id = user_message.id
    db.commit()

    conversation_id_val = conversation.id
    user_id = current_user.id

    def event_stream():
        parts: list[str] = []
        stream_meta = AssistantStreamMeta()
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
                    meta=stream_meta,
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
                if (
                    settings.context_debug or settings.environment == "local"
                ) and stream_meta.context is not None:
                    payload_done["debug"] = {
                        "snippet_count": len(stream_meta.context.snippets),
                        "matched_dates": stream_meta.context.matched_dates,
                        "effective_scope": stream_meta.context.effective_scope,
                        "searched_scopes": stream_meta.context.searched_scopes,
                        "router_confidence": stream_meta.context.router_confidence,
                        "embedding_provider": stream_meta.context.embedding_provider,
                        "model": stream_meta.model,
                    }
            finally:
                save_db.close()

            yield f"event: done\ndata: {json.dumps(payload_done, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            cleanup_db = SessionLocal()
            try:
                stale_message = cleanup_db.get(AssistantMessage, user_message_id)
                if stale_message is not None:
                    cleanup_db.delete(stale_message)
                    cleanup_db.commit()
            finally:
                cleanup_db.close()
            yield f"event: error\ndata: {json.dumps({'message': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
