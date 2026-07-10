from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.agent.digest import run_daily_digest

logger = logging.getLogger(__name__)

_last_scheduled_run_date: date | None = None


def _user_timezone() -> ZoneInfo | timezone:
    try:
        return ZoneInfo(settings.user_timezone)
    except ZoneInfoNotFoundError:
        return timezone.utc


def compute_next_run_at(
    *,
    now: datetime | None = None,
    schedule_hour: int | None = None,
    timezone_info: ZoneInfo | timezone | None = None,
) -> datetime:
    tz = timezone_info or _user_timezone()
    hour = settings.digest_schedule_hour if schedule_hour is None else schedule_hour
    current = (now or datetime.now(tz)).astimezone(tz)
    candidate = current.replace(hour=hour, minute=0, second=0, microsecond=0)
    if current >= candidate:
        candidate += timedelta(days=1)
    return candidate


def _seconds_until(target: datetime) -> float:
    now = datetime.now(target.tzinfo or UTC)
    return max((target - now).total_seconds(), 0.0)


async def _run_scheduled_digest() -> None:
    global _last_scheduled_run_date

    tz = _user_timezone()
    today = datetime.now(tz).date()
    if _last_scheduled_run_date == today:
        logger.info("Digest scheduler skipped duplicate run for %s", today.isoformat())
        return

    _last_scheduled_run_date = today
    logger.info("Digest scheduler starting run for %s", today.isoformat())

    def _execute() -> None:
        db = SessionLocal()
        try:
            result = run_daily_digest(db, user_email=settings.digest_user_email)
            logger.info(
                "Digest scheduler finished: status=%s saved=%s message=%s",
                result.status,
                result.articles_saved,
                result.message,
            )
        except Exception:
            logger.exception("Digest scheduler failed")
        finally:
            db.close()

    await asyncio.to_thread(_execute)


async def digest_scheduler_loop() -> None:
    if not settings.digest_scheduler_enabled or not settings.digest_enabled:
        logger.info("Digest scheduler is disabled")
        return

    tz = _user_timezone()
    while True:
        next_run = compute_next_run_at(timezone_info=tz)
        delay = _seconds_until(next_run)
        logger.info(
            "Digest scheduler enabled, next run at %s (%s)",
            next_run.isoformat(),
            settings.user_timezone,
        )
        await asyncio.sleep(delay)
        await _run_scheduled_digest()


@asynccontextmanager
async def digest_scheduler_lifespan(app):  # noqa: ANN001
    del app
    task: asyncio.Task[None] | None = None
    if settings.digest_scheduler_enabled and settings.digest_enabled:
        task = asyncio.create_task(digest_scheduler_loop())
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
