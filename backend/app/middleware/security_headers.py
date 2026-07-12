from __future__ import annotations

import re
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

_LOCAL_FRONTEND_ORIGIN_RE = re.compile(
    r"^https?://("
    r"localhost|127\.0\.0\.1|\[::1\]"
    r"|192\.168\.\d{1,3}\.\d{1,3}"
    r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
    r"):(?:3000|3001|3002)$"
)


def _origin_from_header(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _transcription_frame_ancestors(request: Request) -> str:
    allowed: list[str] = list(dict.fromkeys(settings.cors_origins))
    for header in (request.headers.get("origin"), request.headers.get("referer")):
        origin = _origin_from_header(header)
        if not origin or origin in allowed:
            continue
        if settings.environment == "local" and _LOCAL_FRONTEND_ORIGIN_RE.match(origin):
            allowed.append(origin)
    return "frame-ancestors 'self' " + " ".join(allowed)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        if request.url.path.startswith("/transcription"):
            response.headers["Content-Security-Policy"] = _transcription_frame_ancestors(request)
        else:
            response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        return response
