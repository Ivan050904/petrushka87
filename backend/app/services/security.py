from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from jose import jwt

from app.core.config import settings

PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 390_000


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _password_digest(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = hashed_password.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        iterations = int(iterations_raw)
        salt = _b64decode(salt_raw)
        expected_digest = _b64decode(digest_raw)
    except (ValueError, TypeError):
        return False

    actual_digest = _password_digest(plain_password, salt, iterations)
    return hmac.compare_digest(actual_digest, expected_digest)


def get_password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _password_digest(password, salt, PASSWORD_HASH_ITERATIONS)
    return "$".join(
        [
            PASSWORD_HASH_ALGORITHM,
            str(PASSWORD_HASH_ITERATIONS),
            _b64encode(salt),
            _b64encode(digest),
        ]
    )


def create_access_token(subject: str, expires_delta: timedelta) -> str:
    expire = datetime.now(UTC) + expires_delta
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
