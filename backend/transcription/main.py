from datetime import datetime, timezone
import json
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Form, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.middleware.sessions import SessionMiddleware

from transcription import app_auth, auth
from transcription.chat_service import ensure_chats_for_user, get_chat_for_job, get_owned_chat, get_user_chats
from transcription.config import settings
from transcription.database import get_db, init_db, SessionLocal
from transcription.models import Chat, ChatMessage, Job, User
from transcription.pipeline import chat as chat_pipeline
from transcription.pipeline.progress import build_steps, estimate_remaining_sec, format_eta
from transcription.pipeline.retry import prepare_retry
from transcription.pipeline.worker import process_job
from transcription.youtube_utils import fmt_date, youtube_thumbnail, youtube_video_id

BASE_DIR = Path(__file__).resolve().parent


def _url(path: str) -> str:
    if not path.startswith("/"):
        path = f"/{path}"
    prefix = settings.root_path
    return f"{prefix}{path}" if prefix else path


from app.core.config import settings as app_settings

app = FastAPI(title="Video Summary")
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    same_site="lax",
    https_only=app_settings.environment == "production",
    path="/transcription",
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

templates = Jinja2Templates(directory=BASE_DIR / "templates")
templates.env.globals["root_path"] = settings.root_path
templates.env.globals["url_for_path"] = _url


def _fmt_duration(sec: int) -> str:
    if not sec:
        return ""
    h, rem = divmod(sec // 60, 60)
    m = rem
    if h:
        return f"{h} ч {m} мин"
    return f"{m} мин"


templates.env.globals["fmt_duration"] = _fmt_duration
templates.env.globals["fmt_date"] = fmt_date
templates.env.globals["youtube_thumbnail"] = youtube_thumbnail
templates.env.globals["youtube_video_id"] = youtube_video_id
templates.env.globals["default_ollama_model"] = lambda: settings.openai_model


def _is_htmx(request: Request) -> bool:
    return request.headers.get("HX-Request") == "true"


def _chat_messages(db: Session, chat_id: int) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_id == chat_id)
        .order_by(ChatMessage.created_at)
        .all()
    )


async def _run_process_job(job_id: int) -> None:
    """Тяжёлую обработку видео запускаем в thread pool, чтобы не блокировать сервер."""
    await run_in_threadpool(process_job, job_id)


def _render_chat_main(
    request: Request,
    user: User,
    db: Session,
    *,
    active_chat: Chat | None = None,
    messages: list[ChatMessage] | None = None,
    refresh_sidebar: bool = False,
):
    ctx = {
        **_chat_context(user, db, active_chat),
        "messages": messages if messages is not None else [],
        "refresh_sidebar": refresh_sidebar,
    }
    return templates.TemplateResponse(request, "partials/chat_main.html", ctx)


def _require_user(request: Request, db: Session) -> User | None:
    return app_auth.resolve_user(request, db)


def _redirect_if_anonymous(request: Request, db: Session) -> RedirectResponse | None:
    if _require_user(request, db):
        return None
    return RedirectResponse(app_auth.app_login_url(), status_code=302)


def _chat_context(user: User, db: Session, active_chat: Chat | None = None) -> dict:
    ensure_chats_for_user(db, user)
    chats = get_user_chats(db, user)
    return {"user": user, "chats": chats, "active_chat": active_chat}


def _job_status_payload(job: Job) -> dict:
    eta_sec = estimate_remaining_sec(job) if job.status == "processing" else 0
    return {
        "id": job.id,
        "status": job.status,
        "stage": job.stage,
        "stage_key": job.stage_key or "metadata",
        "progress": job.progress,
        "title": job.title,
        "url": job.url,
        "source": job.source,
        "duration_sec": job.duration_sec,
        "summary": job.summary,
        "opinions": job.opinions,
        "summary_model": job.summary_model or settings.openai_model,
        "has_transcript": bool(job.transcript),
        "error": job.error,
        "eta_sec": eta_sec,
        "eta_label": format_eta(eta_sec),
        "steps": build_steps(job),
    }


class ChatMessageIn(BaseModel):
    message: str


# ---------- Вход через Folio-One ----------

@app.get("/sso")
def sso_login(request: Request, db: Session = Depends(get_db)):
    token = request.query_params.get("access_token", "").strip()
    user = _require_user(request, db)
    if user:
        response = RedirectResponse(_url("/"), status_code=302)
        if token:
            app_auth.set_auth_cookie(response, token, secure=request.url.scheme == "https")
        return response
    return RedirectResponse(app_auth.app_login_url(), status_code=302)


@app.get("/register", response_class=HTMLResponse)
def register_page(request: Request, db: Session = Depends(get_db)):
    redirect = _redirect_if_anonymous(request, db)
    if redirect is None:
        return RedirectResponse(_url("/"), status_code=302)
    return redirect


@app.post("/register", response_class=HTMLResponse)
def register_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    return RedirectResponse(app_auth.app_login_url(), status_code=302)


@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, db: Session = Depends(get_db)):
    redirect = _redirect_if_anonymous(request, db)
    if redirect is None:
        return RedirectResponse(_url("/"), status_code=302)
    return redirect


@app.post("/login", response_class=HTMLResponse)
def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    return RedirectResponse(app_auth.app_login_url(), status_code=302)


@app.get("/logout")
def logout(request: Request):
    auth.logout_user(request)
    return RedirectResponse(app_auth.app_login_url(), status_code=302)


# ---------- Чаты (главный интерфейс) ----------

@app.get("/", response_class=HTMLResponse)
def index(request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return RedirectResponse(app_auth.app_login_url(), status_code=302)
    ctx = _chat_context(user, db)
    return templates.TemplateResponse(request, "chat.html", {**ctx, "messages": []})


@app.get("/panel/new", response_class=HTMLResponse)
def new_chat_panel(request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return RedirectResponse(app_auth.app_login_url(), status_code=302)
    return _render_chat_main(request, user, db, active_chat=None)


@app.get("/chats/{chat_id}/panel", response_class=HTMLResponse)
def chat_panel(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return RedirectResponse(app_auth.app_login_url(), status_code=302)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return RedirectResponse(_url("/"), status_code=302)
    messages = _chat_messages(db, chat.id)
    return _render_chat_main(request, user, db, active_chat=chat, messages=messages)


@app.get("/chats/{chat_id}", response_class=HTMLResponse)
def chat_page(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return RedirectResponse(app_auth.app_login_url(), status_code=302)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return RedirectResponse(_url("/"), status_code=302)
    messages = _chat_messages(db, chat.id)
    if _is_htmx(request):
        return _render_chat_main(request, user, db, active_chat=chat, messages=messages)
    ctx = {**_chat_context(user, db, active_chat=chat), "messages": messages}
    return templates.TemplateResponse(request, "chat.html", ctx)


@app.post("/chats")
def create_chat(
    request: Request,
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    db: Session = Depends(get_db),
):
    user = _require_user(request, db)
    if not user:
        return RedirectResponse(app_auth.app_login_url(), status_code=302)

    url = url.strip()
    if not url:
        return RedirectResponse(_url("/"), status_code=302)

    job = Job(user_id=user.id, url=url, status="queued", stage="В очереди", stage_key="metadata")
    db.add(job)
    db.flush()

    chat = Chat(user_id=user.id, job_id=job.id, title=url)
    db.add(chat)
    db.commit()
    chat = get_owned_chat(chat.id, user, db)

    background_tasks.add_task(_run_process_job, job.id)

    if _is_htmx(request):
        response = _render_chat_main(
            request,
            user,
            db,
            active_chat=chat,
            messages=[],
            refresh_sidebar=True,
        )
        response.headers["HX-Push-Url"] = _url(f"/chats/{chat.id}")
        return response

    return RedirectResponse(_url(f"/chats/{chat.id}"), status_code=302)


@app.get("/chats/{chat_id}/status")
def chat_status(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse({"error": "auth"}, status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    job = chat.job
    if job.title and chat.title != job.title:
        chat.title = job.title
        db.commit()

    return _job_status_payload(job)


@app.get("/chats/{chat_id}/messages")
def chat_messages(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse({"error": "auth"}, status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_id == chat.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return {
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
            for m in messages
        ]
    }


@app.post("/chats/{chat_id}/messages")
def send_chat_message(
    chat_id: int,
    body: ChatMessageIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _require_user(request, db)
    if not user:
        return JSONResponse({"error": "auth"}, status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    job = chat.job
    if job.status != "done":
        return JSONResponse(
            {"error": "not_ready", "message": "Сначала дождитесь обработки видео."},
            status_code=400,
        )

    question = body.message.strip()
    if not question:
        return JSONResponse({"error": "empty", "message": "Введите вопрос."}, status_code=400)

    user_msg = ChatMessage(chat_id=chat.id, role="user", content=question)
    db.add(user_msg)
    db.flush()

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_id == chat.id, ChatMessage.id != user_msg.id)
        .order_by(ChatMessage.created_at)
        .all()
    )

    try:
        answer = chat_pipeline.answer_question(job, history, question)
    except ValueError as exc:
        db.rollback()
        return JSONResponse({"error": "bad_request", "message": str(exc)}, status_code=400)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return JSONResponse(
            {"error": "llm", "message": f"Не удалось получить ответ: {exc}"},
            status_code=500,
        )

    assistant_msg = ChatMessage(chat_id=chat.id, role="assistant", content=answer)
    db.add(assistant_msg)
    chat.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(assistant_msg)

    return {
        "user_message": {"id": user_msg.id, "role": "user", "content": user_msg.content},
        "assistant_message": {
            "id": assistant_msg.id,
            "role": "assistant",
            "content": assistant_msg.content,
        },
    }


@app.post("/chats/{chat_id}/messages/stream")
def send_chat_message_stream(
    chat_id: int,
    body: ChatMessageIn,
    request: Request,
    db: Session = Depends(get_db),
):
    user = _require_user(request, db)
    if not user:
        return JSONResponse({"error": "auth"}, status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    job = chat.job
    if job.status != "done":
        return JSONResponse(
            {"error": "not_ready", "message": "Сначала дождитесь обработки видео."},
            status_code=400,
        )

    question = body.message.strip()
    if not question:
        return JSONResponse({"error": "empty", "message": "Введите вопрос."}, status_code=400)

    user_msg = ChatMessage(chat_id=chat.id, role="user", content=question)
    db.add(user_msg)
    db.flush()
    user_msg_id = user_msg.id

    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_id == chat.id, ChatMessage.id != user_msg.id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    chat_id_val = chat.id
    job_id = job.id
    db.commit()

    def event_stream():
        parts: list[str] = []
        stream_error: str | None = None
        try:
            yield f"event: start\ndata: {json.dumps({'user_message_id': user_msg_id})}\n\n"

            stream_db = SessionLocal()
            try:
                stream_job = stream_db.get(Job, job_id)
                if stream_job is None:
                    raise RuntimeError("Видео не найдено")
                stream_history = (
                    stream_db.query(ChatMessage)
                    .filter(ChatMessage.chat_id == chat_id_val, ChatMessage.id != user_msg_id)
                    .order_by(ChatMessage.created_at)
                    .all()
                )
                for delta in chat_pipeline.answer_question_stream(stream_job, stream_history, question):
                    parts.append(delta)
                    yield f"event: token\ndata: {json.dumps({'text': delta}, ensure_ascii=False)}\n\n"
            finally:
                stream_db.close()

            answer = "".join(parts).strip()
            if not answer:
                raise RuntimeError("Модель вернула пустой ответ")

            save_db = SessionLocal()
            try:
                save_chat = save_db.get(Chat, chat_id_val)
                if save_chat is None:
                    raise RuntimeError("Чат не найден")
                assistant_msg = ChatMessage(chat_id=chat_id_val, role="assistant", content=answer)
                save_db.add(assistant_msg)
                save_chat.updated_at = datetime.now(timezone.utc)
                save_db.commit()
                save_db.refresh(assistant_msg)
                payload = {
                    "id": assistant_msg.id,
                    "role": "assistant",
                    "content": answer,
                }
            finally:
                save_db.close()

            yield f"event: done\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        except ValueError as exc:
            stream_error = str(exc)
            yield f"event: error\ndata: {json.dumps({'message': stream_error}, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            partial = "".join(parts).strip()
            if partial:
                save_db = SessionLocal()
                try:
                    save_chat = save_db.get(Chat, chat_id_val)
                    if save_chat is not None:
                        assistant_msg = ChatMessage(chat_id=chat_id_val, role="assistant", content=partial)
                        save_db.add(assistant_msg)
                        save_chat.updated_at = datetime.now(timezone.utc)
                        save_db.commit()
                finally:
                    save_db.close()
            stream_error = f"Не удалось получить ответ: {exc}"
            yield f"event: error\ndata: {json.dumps({'message': stream_error}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.delete("/chats/{chat_id}")
def delete_chat(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse({"error": "auth"}, status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    job = chat.job
    db.delete(chat)
    if job is not None:
        db.delete(job)
    db.commit()
    return JSONResponse({"ok": True, "redirect": _url("/")})


@app.post("/chats/{chat_id}/retry")
def retry_chat(
    chat_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    mode: str = Query("llm"),
    db: Session = Depends(get_db),
):
    user = _require_user(request, db)
    if not user:
        return JSONResponse({"error": "auth"}, status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return JSONResponse({"error": "not_found"}, status_code=404)

    job = chat.job
    try:
        prepare_retry(job, mode)
        db.commit()
    except ValueError as exc:
        return JSONResponse({"error": "conflict", "message": str(exc)}, status_code=409)

    background_tasks.add_task(_run_process_job, job.id)
    messages = _chat_messages(db, chat.id)

    if _is_htmx(request):
        response = _render_chat_main(
            request,
            user,
            db,
            active_chat=chat,
            messages=messages,
            refresh_sidebar=True,
        )
        return response

    return JSONResponse({"ok": True, "status": "processing"})


# ---------- Старые маршруты jobs (редиректы и download) ----------

@app.post("/jobs")
def create_job_legacy(
    request: Request,
    background_tasks: BackgroundTasks,
    url: str = Form(...),
    db: Session = Depends(get_db),
):
    return create_chat(request, background_tasks, url, db)


def _get_owned_job(job_id: int, user: User, db: Session) -> Job | None:
    job = db.get(Job, job_id)
    if job is None or job.user_id != user.id:
        return None
    return job


@app.get("/jobs/{job_id}")
def job_page_legacy(job_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return RedirectResponse(app_auth.app_login_url(), status_code=302)
    job = _get_owned_job(job_id, user, db)
    if job is None:
        return RedirectResponse(_url("/"), status_code=302)
    ensure_chats_for_user(db, user)
    chat = get_chat_for_job(job_id, user, db)
    if chat is None:
        chat = Chat(user_id=user.id, job_id=job.id, title=job.title or job.url)
        db.add(chat)
        db.commit()
    return RedirectResponse(_url(f"/chats/{chat.id}"), status_code=302)


@app.get("/jobs/{job_id}/status")
def job_status_legacy(job_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return JSONResponse({"error": "auth"}, status_code=401)
    job = _get_owned_job(job_id, user, db)
    if job is None:
        return JSONResponse({"error": "not_found"}, status_code=404)
    return _job_status_payload(job)


@app.get("/jobs/{job_id}/transcript", response_class=PlainTextResponse)
def job_transcript(job_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return PlainTextResponse("Нужно войти", status_code=401)
    job = _get_owned_job(job_id, user, db)
    if job is None:
        return PlainTextResponse("Не найдено", status_code=404)
    return job.transcript or ""


@app.get("/chats/{chat_id}/transcript", response_class=PlainTextResponse)
def chat_transcript(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return PlainTextResponse("Нужно войти", status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return PlainTextResponse("Не найдено", status_code=404)
    return chat.job.transcript or ""


def _download(text: str, filename: str) -> PlainTextResponse:
    return PlainTextResponse(
        text or "",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        media_type="text/plain; charset=utf-8",
    )


@app.get("/jobs/{job_id}/download/summary")
def download_summary(job_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return PlainTextResponse("Нужно войти", status_code=401)
    job = _get_owned_job(job_id, user, db)
    if job is None:
        return PlainTextResponse("Не найдено", status_code=404)
    return _download(job.summary, f"summary_{job.id}.txt")


@app.get("/jobs/{job_id}/download/transcript")
def download_transcript(job_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return PlainTextResponse("Нужно войти", status_code=401)
    job = _get_owned_job(job_id, user, db)
    if job is None:
        return PlainTextResponse("Не найдено", status_code=404)
    return _download(job.transcript, f"transcript_{job.id}.txt")


@app.get("/chats/{chat_id}/download/summary")
def download_chat_summary(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return PlainTextResponse("Нужно войти", status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return PlainTextResponse("Не найдено", status_code=404)
    job = chat.job
    return _download(job.summary, f"summary_{job.id}.txt")


@app.get("/chats/{chat_id}/download/transcript")
def download_chat_transcript(chat_id: int, request: Request, db: Session = Depends(get_db)):
    user = _require_user(request, db)
    if not user:
        return PlainTextResponse("Нужно войти", status_code=401)
    chat = get_owned_chat(chat_id, user, db)
    if chat is None:
        return PlainTextResponse("Не найдено", status_code=404)
    job = chat.job
    return _download(job.transcript, f"transcript_{job.id}.txt")


def create_transcription_app() -> FastAPI:
    init_db()
    return app
