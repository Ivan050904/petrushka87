from __future__ import annotations

import re
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.services.ai.base import AIUnavailableError
from app.services.assistant.llm import AssistantLLMClient, get_assistant_client
from app.services.assistant.schemas import (
    AssistantActionResult,
    AssistantChatResponse,
    PendingAction,
)
from app.services.assistant.session import (
    append_message,
    load_session,
    new_session_id,
    save_session,
    set_pending,
    set_pending_confirmation,
)
from app.services.assistant.tools import (
    build_pending,
    execute_pending,
    list_entries_preview,
    merge_pending_params,
    missing_fields,
    update_entry_record,
    validate_pending_params,
)

_CONFIRM_RE = re.compile(
    r"^(да|ок|ok|yes|подтверждаю|создай|создать|согласен|согласна|верно|правильно)\b",
    re.IGNORECASE,
)


def run_assistant_turn(
    db: Session,
    *,
    user_id: uuid.UUID,
    message: str,
    session_id: str | None,
    confirm: bool = False,
    llm_client: AssistantLLMClient | None = None,
) -> AssistantChatResponse:
    client = llm_client or get_assistant_client()
    configured = client is not None and client.is_configured()
    resolved_session_id = session_id or new_session_id()
    session = load_session(db, str(user_id), resolved_session_id)
    session.user_id = str(user_id)

    user_message = message.strip()
    actions: list[AssistantActionResult] = []
    entries_preview: list[dict] = []
    reply = ""

    if not configured:
        reply = (
            "Ассистент пока не настроен. Добавьте ASSISTANT_API_KEY и включите "
            "ASSISTANT_ENABLED=true в backend/.env."
        )
        append_message(session, "user", user_message)
        append_message(session, "assistant", reply)
        save_session(db, session)
        return AssistantChatResponse(
            reply=reply,
            session_id=resolved_session_id,
            configured=False,
        )

    if session.pending is not None:
        pending_action = session.pending.action
        merged = merge_pending_params(session.pending, user_message)
        still_missing = missing_fields(pending_action, merged)
        if still_missing:
            session.pending.params = merged
            session.pending.missing_fields = still_missing
            reply = _missing_fields_reply(session.pending)
            append_message(session, "user", user_message)
            append_message(session, "assistant", reply)
            save_session(db, session)
            return AssistantChatResponse(
                reply=reply,
                session_id=resolved_session_id,
                configured=True,
            )

        set_pending(session, None)
        draft = PendingAction(action=pending_action, params=merged)
        if settings.assistant_auto_confirm or confirm or _is_confirmation(user_message):
            try:
                validate_pending_params(pending_action, merged)
                action_result = execute_pending(db, user_id=user_id, pending=draft)
                actions.append(action_result)
                reply = _created_reply(action_result)
            except ValueError as exc:
                reply = f"Не удалось создать запись: {exc}"
            append_message(session, "user", user_message)
            append_message(session, "assistant", reply)
            save_session(db, session)
            return AssistantChatResponse(
                reply=reply,
                session_id=resolved_session_id,
                configured=True,
                actions=actions,
            )

        set_pending_confirmation(session, draft)
        reply = _confirmation_reply(draft)
        append_message(session, "user", user_message)
        append_message(session, "assistant", reply)
        save_session(db, session)
        return AssistantChatResponse(
            reply=reply,
            session_id=resolved_session_id,
            configured=True,
            pending_confirmation=draft,
        )

    if session.pending_confirmation is not None and (confirm or _is_confirmation(user_message)):
        try:
            validate_pending_params(
                session.pending_confirmation.action,
                session.pending_confirmation.params,
            )
            action_result = execute_pending(
                db,
                user_id=user_id,
                pending=session.pending_confirmation,
            )
            actions.append(action_result)
            set_pending_confirmation(session, None)
            reply = _created_reply(action_result)
            append_message(session, "user", user_message)
            append_message(session, "assistant", reply)
            save_session(db, session)
            return AssistantChatResponse(
                reply=reply,
                session_id=resolved_session_id,
                configured=True,
                actions=actions,
            )
        except ValueError as exc:
            reply = f"Не удалось создать запись: {exc}"
            append_message(session, "user", user_message)
            append_message(session, "assistant", reply)
            save_session(db, session)
            return AssistantChatResponse(
                reply=reply,
                session_id=resolved_session_id,
                configured=True,
                pending_confirmation=session.pending_confirmation,
            )

    try:
        decision = client.decide(
            session=session,
            user_message=user_message,
            pending=session.pending,
            pending_confirmation=session.pending_confirmation,
        )
    except AIUnavailableError as exc:
        reply = f"Ошибка ассистента: {exc}"
        append_message(session, "user", user_message)
        append_message(session, "assistant", reply)
        save_session(db, session)
        return AssistantChatResponse(
            reply=reply,
            session_id=resolved_session_id,
            configured=True,
        )

    reply = decision.reply.strip()
    action = decision.action
    params = dict(decision.params)

    if action in {"create_task", "create_event"}:
        pending = build_pending(action, params)
        if pending is not None:
            set_pending(session, pending)
            if not reply:
                reply = _missing_fields_reply(pending)
            append_message(session, "user", user_message)
            append_message(session, "assistant", reply)
            save_session(db, session)
            return AssistantChatResponse(
                reply=reply,
                session_id=resolved_session_id,
                configured=True,
            )

        draft = PendingAction(action=action, params=params)
        if settings.assistant_auto_confirm or confirm:
            try:
                validate_pending_params(action, params)
                action_result = execute_pending(db, user_id=user_id, pending=draft)
                actions.append(action_result)
                if not reply:
                    reply = _created_reply(action_result)
            except ValueError as exc:
                reply = f"Не удалось создать запись: {exc}"
        else:
            set_pending_confirmation(session, draft)
            if not reply:
                reply = _confirmation_reply(draft)
            append_message(session, "user", user_message)
            append_message(session, "assistant", reply)
            save_session(db, session)
            return AssistantChatResponse(
                reply=reply,
                session_id=resolved_session_id,
                configured=True,
                pending_confirmation=draft,
            )

    elif action == "list_entries":
        entries_preview = list_entries_preview(db, user_id=user_id, params=params)
        if not reply:
            reply = _list_reply(entries_preview)

    elif action == "update_entry":
        try:
            action_result = update_entry_record(db, user_id=user_id, params=params)
            actions.append(action_result)
            if not reply:
                reply = f"Обновил «{action_result.title}»."
        except ValueError as exc:
            reply = f"Не удалось обновить запись: {exc}"

    elif action == "ask_user":
        intent = params.get("intent")
        if intent in {"create_task", "create_event"}:
            slot_params = {
                key: value
                for key, value in params.items()
                if key not in {"missing_fields", "intent", "question"}
            }
            pending = build_pending(intent, slot_params)
            if pending is not None:
                set_pending(session, pending)
                if not reply:
                    reply = _missing_fields_reply(pending)

    elif action == "confirm_pending" and session.pending_confirmation is not None:
        try:
            validate_pending_params(
                session.pending_confirmation.action,
                session.pending_confirmation.params,
            )
            action_result = execute_pending(
                db,
                user_id=user_id,
                pending=session.pending_confirmation,
            )
            actions.append(action_result)
            set_pending_confirmation(session, None)
            if not reply:
                reply = _created_reply(action_result)
        except ValueError as exc:
            reply = f"Не удалось создать запись: {exc}"

    append_message(session, "user", user_message)
    append_message(session, "assistant", reply or "Готово.")
    save_session(db, session)
    return AssistantChatResponse(
        reply=reply or "Готово.",
        session_id=resolved_session_id,
        configured=True,
        actions=actions,
        entries_preview=entries_preview,
        pending_confirmation=session.pending_confirmation,
    )


def _is_confirmation(message: str) -> bool:
    return bool(_CONFIRM_RE.search(message.strip()))


def _missing_fields_reply(pending: PendingAction) -> str:
    labels = {
        "title": "название",
        "starts_at": "дату и время начала",
        "ends_at": "время окончания",
        "deadline": "дедлайн",
        "scheduled_at": "время",
        "location": "место",
    }
    missing = [labels.get(field, field) for field in pending.missing_fields]
    kind = "задачу" if pending.action == "create_task" else "встречу"
    return f"Чтобы создать {kind}, уточните: {', '.join(missing)}."


def _confirmation_reply(pending: PendingAction) -> str:
    title = pending.params.get("title", "запись")
    if pending.action == "create_event":
        when = pending.params.get("starts_at", "")
        where = pending.params.get("location")
        parts = [f"Создать встречу «{title}»"]
        if when:
            parts.append(f"на {when}")
        if where:
            parts.append(f"({where})")
        parts.append("? Напишите «да» или нажмите Подтвердить.")
        return " ".join(parts)
    return f"Создать задачу «{title}»? Напишите «да» или нажмите Подтвердить."


def _created_reply(action: AssistantActionResult) -> str:
    if action.type == "event":
        when = action.metadata.get("starts_at", "")
        where = action.metadata.get("location")
        parts = [f"Создал встречу «{action.title}»"]
        if when:
            parts.append(f"на {when}")
        if where:
            parts.append(f"в {where}")
        return " ".join(parts) + "."
    return f"Создал задачу «{action.title}»."


def _list_reply(entries: list[dict]) -> str:
    if not entries:
        return "Подходящих задач и встреч не нашёл."
    lines = ["Нашёл:"]
    for item in entries[:5]:
        kind = "задача" if item.get("type") == "task" else "встреча"
        lines.append(f"• {kind}: {item.get('title')}")
    return "\n".join(lines)
