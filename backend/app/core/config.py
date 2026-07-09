from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
import os
from pathlib import Path


def _read_dotenv(path: str = ".env") -> dict[str, str]:
    env_path = Path(path)
    if not env_path.exists():
        backend_env_path = Path(__file__).resolve().parents[2] / ".env"
        env_path = backend_env_path if backend_env_path.exists() else env_path
    if not env_path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _env(values: dict[str, str], name: str, default: str) -> str:
    return os.environ.get(name, values.get(name, default))


def _env_int(values: dict[str, str], name: str, default: int) -> int:
    raw_value = _env(values, name, str(default))
    try:
        return int(raw_value)
    except ValueError:
        return default


def _env_bool(values: dict[str, str], name: str, default: bool) -> bool:
    raw_value = _env(values, name, str(default)).strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


def _env_list(values: dict[str, str], name: str, default: list[str]) -> list[str]:
    raw_value = _env(values, name, ",".join(default))
    return [item.strip() for item in raw_value.split(",") if item.strip()]


DEFAULT_DATABASE_URL = (
    f"sqlite:///{(Path(__file__).resolve().parents[2] / 'storage' / 'letscore.db').as_posix()}"
)
DEFAULT_LOCAL_STORAGE_PATH = str(Path(__file__).resolve().parents[2] / "storage" / "files")


@dataclass(frozen=True)
class Settings:
    app_name: str = "LetsCore"
    environment: str = "local"
    api_v1_prefix: str = "/api/v1"

    database_url: str = DEFAULT_DATABASE_URL
    secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3002",
            "http://127.0.0.1:3002",
        ]
    )

    ai_provider: str = "openai-compatible"
    ai_classification_enabled: bool = False
    user_timezone: str = "Asia/Vladivostok"
    openai_compatible_base_url: str = "https://api.openai.com/v1"
    openai_compatible_api_key: str = ""
    openai_compatible_model: str = ""
    yandex_ai_base_url: str = "https://ai.api.cloud.yandex.net/v1"
    yandex_cloud_folder_id: str = ""
    yandex_cloud_api_key: str = ""
    yandex_cloud_model: str = "aliceai-llm-flash/latest"

    file_storage_provider: str = "local"
    local_storage_path: str = DEFAULT_LOCAL_STORAGE_PATH
    s3_bucket_name: str = ""
    s3_prefix: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""


@lru_cache
def get_settings() -> Settings:
    dotenv = _read_dotenv()
    return Settings(
        app_name=_env(dotenv, "APP_NAME", "LetsCore"),
        environment=_env(dotenv, "ENVIRONMENT", "local"),
        api_v1_prefix=_env(dotenv, "API_V1_PREFIX", "/api/v1"),
        database_url=_env(
            dotenv,
            "DATABASE_URL",
            DEFAULT_DATABASE_URL,
        ),
        secret_key=_env(dotenv, "SECRET_KEY", "change-me"),
        jwt_algorithm=_env(dotenv, "JWT_ALGORITHM", "HS256"),
        access_token_expire_minutes=_env_int(dotenv, "ACCESS_TOKEN_EXPIRE_MINUTES", 60 * 24 * 7),
        cors_origins=_env_list(
            dotenv,
            "CORS_ORIGINS",
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:3001",
                "http://127.0.0.1:3001",
                "http://localhost:3002",
                "http://127.0.0.1:3002",
            ],
        ),
        ai_provider=_env(dotenv, "AI_PROVIDER", "openai-compatible"),
        ai_classification_enabled=_env_bool(dotenv, "AI_CLASSIFICATION_ENABLED", False),
        user_timezone=_env(dotenv, "USER_TIMEZONE", "Asia/Vladivostok"),
        openai_compatible_base_url=_env(
            dotenv,
            "OPENAI_COMPATIBLE_BASE_URL",
            "https://api.openai.com/v1",
        ),
        openai_compatible_api_key=_env(dotenv, "OPENAI_COMPATIBLE_API_KEY", ""),
        openai_compatible_model=_env(dotenv, "OPENAI_COMPATIBLE_MODEL", ""),
        yandex_ai_base_url=_env(
            dotenv,
            "YANDEX_AI_BASE_URL",
            "https://ai.api.cloud.yandex.net/v1",
        ),
        yandex_cloud_folder_id=_env(dotenv, "YANDEX_CLOUD_FOLDER_ID", ""),
        yandex_cloud_api_key=_env(dotenv, "YANDEX_CLOUD_API_KEY", ""),
        yandex_cloud_model=_env(dotenv, "YANDEX_CLOUD_MODEL", "aliceai-llm-flash/latest"),
        file_storage_provider=_env(dotenv, "FILE_STORAGE_PROVIDER", "local"),
        local_storage_path=_env(dotenv, "LOCAL_STORAGE_PATH", DEFAULT_LOCAL_STORAGE_PATH),
        s3_bucket_name=_env(dotenv, "S3_BUCKET_NAME", ""),
        s3_prefix=_env(dotenv, "S3_PREFIX", ""),
        s3_endpoint_url=_env(dotenv, "S3_ENDPOINT_URL", ""),
        s3_region=_env(dotenv, "S3_REGION", ""),
        s3_access_key_id=_env(dotenv, "S3_ACCESS_KEY_ID", ""),
        s3_secret_access_key=_env(dotenv, "S3_SECRET_ACCESS_KEY", ""),
    )


settings = get_settings()
