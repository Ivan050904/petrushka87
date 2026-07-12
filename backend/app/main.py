from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select

from app.api.router import api_router
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.session import SessionLocal
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.models.user import User
from app.services.agent.scheduler import digest_scheduler_lifespan
from app.services.entry_links import migrate_metadata_links_for_user
from transcription.main import create_transcription_app

logger = logging.getLogger(__name__)

_METADATA_LINKS_FLAG = (
    __import__("pathlib").Path(__file__).resolve().parents[1] / "storage" / "logs" / ".metadata_links_migrated"
)


def _run_metadata_links_migration() -> None:
    if _METADATA_LINKS_FLAG.exists():
        return
    db = SessionLocal()
    try:
        user_ids = db.scalars(select(User.id)).all()
        for user_id in user_ids:
            migrate_metadata_links_for_user(db, user_id)
        db.commit()
        _METADATA_LINKS_FLAG.parent.mkdir(parents=True, exist_ok=True)
        _METADATA_LINKS_FLAG.write_text("done", encoding="utf-8")
    except Exception:
        logger.exception("Failed to migrate metadata links")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_metadata_links_migration()
    async with digest_scheduler_lifespan(app):
        yield


_is_production = settings.environment == "production"

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=(
        r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(3000|3001|3002)$"
        if settings.environment == "local"
        else None
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)
app.mount("/transcription", create_transcription_app())


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
