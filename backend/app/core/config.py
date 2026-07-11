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
    f"sqlite:///{(Path(__file__).resolve().parents[2] / 'storage' / 'folio_one.db').as_posix()}"
)
DEFAULT_LOCAL_STORAGE_PATH = str(Path(__file__).resolve().parents[2] / "storage" / "files")


@dataclass(frozen=True)
class Settings:
    app_name: str = "Folio-One"
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

    notes_ai_enabled: bool = True
    notes_ai_provider: str = "auto"
    notes_ai_base_url: str = ""
    notes_ai_api_key: str = ""
    notes_ai_model: str = ""

    finance_ai_enabled: bool = True
    finance_ai_base_url: str = ""
    finance_ai_api_key: str = ""
    finance_ai_model: str = ""

    assistant_enabled: bool = False
    assistant_base_url: str = "https://models.github.ai/inference"
    assistant_api_key: str = ""
    assistant_model: str = "openai/gpt-4o-mini"
    assistant_auto_confirm: bool = False
    assistant_max_history: int = 20

    speech_enabled: bool = True
    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    speech_language: str = "ru"
    speech_max_bytes: int = 25 * 1024 * 1024

    digest_enabled: bool = True
    digest_topics: list[str] = field(
        default_factory=lambda: [
            "ии агенты",
            "cursor ai",
            "claude codex",
            "claude агент",
            "cursor ide",
        ]
    )
    digest_max_articles: int = 5
    digest_schedule_hour: int = 8
    digest_user_email: str = "demo@folio-one.local"
    digest_llm_base_url: str = "http://localhost:11434/v1"
    digest_llm_api_key: str = "ollama"
    digest_llm_model: str = "qwen2.5-coder:7b"
    digest_search_provider: str = "habr"
    digest_first_run_lookback_days: int = 7
    digest_scheduler_enabled: bool = True

    psych_digest_enabled: bool = True
    psych_digest_max_articles: int = 3
    psych_digest_schedule_hour: int = 8
    psych_digest_llm_provider: str = "auto"
    psych_digest_llm_base_url: str = ""
    psych_digest_llm_api_key: str = ""
    psych_digest_llm_model: str = "openai/gpt-4o"
    psych_digest_queries: list[str] = field(default_factory=list)
    psych_digest_use_llm_filter: bool = False
    psych_digest_tuned_queries_max_age_days: int = 7
    psych_digest_tune_min_feedback: int = 3

    context_candidate_limit: int = 1500
    context_snippet_limit: int = 40
    context_max_chars: int = 24000
    context_date_lookup_enabled: bool = True
    context_debug: bool = False
    context_router_multi_scope: bool = True

    context_embeddings_enabled: bool = True
    context_embeddings_provider: str = "auto"
    context_embeddings_model: str = "text-embedding-3-small"
    context_embeddings_api_key: str = ""
    context_embeddings_base_url: str = ""

    file_storage_provider: str = "local"
    local_storage_path: str = DEFAULT_LOCAL_STORAGE_PATH
    s3_bucket_name: str = ""
    s3_prefix: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""

    therapy_sessions_enabled: bool = True
    therapy_max_upload_bytes: int = 524_288_000
    therapy_llm_provider: str = "auto"
    therapy_llm_base_url: str = ""
    therapy_llm_api_key: str = ""
    therapy_llm_model: str = "openai/gpt-4o"
    therapy_whisper_model: str = "small"
    therapy_whisper_device: str = "cpu"
    therapy_whisper_compute_type: str = "int8"
    therapy_diarization_enabled: bool = True
    therapy_num_speakers: int = 2
    hf_token: str = ""


@lru_cache
def get_settings() -> Settings:
    dotenv = _read_dotenv()
    return Settings(
        app_name=_env(dotenv, "APP_NAME", "Folio-One"),
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
        notes_ai_enabled=_env_bool(dotenv, "NOTES_AI_ENABLED", True),
        notes_ai_provider=_env(dotenv, "NOTES_AI_PROVIDER", "auto"),
        notes_ai_base_url=_env(dotenv, "NOTES_AI_BASE_URL", ""),
        notes_ai_api_key=_env(dotenv, "NOTES_AI_API_KEY", ""),
        notes_ai_model=_env(dotenv, "NOTES_AI_MODEL", ""),
        finance_ai_enabled=_env_bool(dotenv, "FINANCE_AI_ENABLED", True),
        finance_ai_base_url=_env(dotenv, "FINANCE_AI_BASE_URL", ""),
        finance_ai_api_key=_env(dotenv, "FINANCE_AI_API_KEY", ""),
        finance_ai_model=_env(dotenv, "FINANCE_AI_MODEL", ""),
        assistant_enabled=_env_bool(dotenv, "ASSISTANT_ENABLED", False),
        assistant_base_url=_env(
            dotenv,
            "ASSISTANT_BASE_URL",
            "https://models.github.ai/inference",
        ),
        assistant_api_key=_env(dotenv, "ASSISTANT_API_KEY", ""),
        assistant_model=_env(dotenv, "ASSISTANT_MODEL", "openai/gpt-4o-mini"),
        assistant_auto_confirm=_env_bool(dotenv, "ASSISTANT_AUTO_CONFIRM", False),
        assistant_max_history=_env_int(dotenv, "ASSISTANT_MAX_HISTORY", 20),
        speech_enabled=_env_bool(dotenv, "SPEECH_ENABLED", True),
        whisper_model=_env(dotenv, "WHISPER_MODEL", "small"),
        whisper_device=_env(dotenv, "WHISPER_DEVICE", "cpu"),
        whisper_compute_type=_env(dotenv, "WHISPER_COMPUTE_TYPE", "int8"),
        speech_language=_env(dotenv, "SPEECH_LANGUAGE", "ru"),
        speech_max_bytes=_env_int(dotenv, "SPEECH_MAX_BYTES", 25 * 1024 * 1024),
        digest_enabled=_env_bool(dotenv, "DIGEST_ENABLED", True),
        digest_topics=_env_list(
            dotenv,
            "DIGEST_TOPICS",
            [
                "ии агенты",
                "cursor ai",
                "claude codex",
                "claude агент",
                "cursor ide",
            ],
        ),
        digest_max_articles=_env_int(dotenv, "DIGEST_MAX_ARTICLES", 5),
        digest_schedule_hour=_env_int(dotenv, "DIGEST_SCHEDULE_HOUR", 8),
        digest_user_email=_env(dotenv, "DIGEST_USER_EMAIL", "demo@folio-one.local"),
        digest_llm_base_url=_env(dotenv, "DIGEST_LLM_BASE_URL", "http://localhost:11434/v1"),
        digest_llm_api_key=_env(dotenv, "DIGEST_LLM_API_KEY", "ollama"),
        digest_llm_model=_env(dotenv, "DIGEST_LLM_MODEL", "qwen2.5-coder:7b"),
        digest_search_provider=_env(dotenv, "DIGEST_SEARCH_PROVIDER", "habr"),
        digest_first_run_lookback_days=_env_int(dotenv, "DIGEST_FIRST_RUN_LOOKBACK_DAYS", 7),
        digest_scheduler_enabled=_env_bool(dotenv, "DIGEST_SCHEDULER_ENABLED", True),
        psych_digest_enabled=_env_bool(dotenv, "PSYCH_DIGEST_ENABLED", True),
        psych_digest_max_articles=_env_int(dotenv, "PSYCH_DIGEST_MAX_ARTICLES", 3),
        psych_digest_schedule_hour=_env_int(dotenv, "PSYCH_DIGEST_SCHEDULE_HOUR", 8),
        psych_digest_llm_provider=_env(dotenv, "PSYCH_DIGEST_LLM_PROVIDER", "auto"),
        psych_digest_llm_base_url=_env(dotenv, "PSYCH_DIGEST_LLM_BASE_URL", ""),
        psych_digest_llm_api_key=_env(dotenv, "PSYCH_DIGEST_LLM_API_KEY", ""),
        psych_digest_llm_model=_env(dotenv, "PSYCH_DIGEST_LLM_MODEL", "openai/gpt-4o"),
        psych_digest_queries=_env_list(dotenv, "PSYCH_DIGEST_QUERIES", []),
        psych_digest_use_llm_filter=_env_bool(dotenv, "PSYCH_DIGEST_USE_LLM_FILTER", False),
        psych_digest_tuned_queries_max_age_days=_env_int(
            dotenv, "PSYCH_DIGEST_TUNED_QUERIES_MAX_AGE_DAYS", 7
        ),
        psych_digest_tune_min_feedback=_env_int(dotenv, "PSYCH_DIGEST_TUNE_MIN_FEEDBACK", 3),
        context_candidate_limit=_env_int(dotenv, "CONTEXT_CANDIDATE_LIMIT", 1500),
        context_snippet_limit=_env_int(dotenv, "CONTEXT_SNIPPET_LIMIT", 40),
        context_max_chars=_env_int(dotenv, "CONTEXT_MAX_CHARS", 24000),
        context_date_lookup_enabled=_env_bool(dotenv, "CONTEXT_DATE_LOOKUP_ENABLED", True),
        context_debug=_env_bool(dotenv, "CONTEXT_DEBUG", False),
        context_router_multi_scope=_env_bool(dotenv, "CONTEXT_ROUTER_MULTI_SCOPE", True),
        context_embeddings_enabled=_env_bool(dotenv, "CONTEXT_EMBEDDINGS_ENABLED", True),
        context_embeddings_provider=_env(dotenv, "CONTEXT_EMBEDDINGS_PROVIDER", "auto"),
        context_embeddings_model=_env(dotenv, "CONTEXT_EMBEDDINGS_MODEL", "text-embedding-3-small"),
        context_embeddings_api_key=_env(dotenv, "CONTEXT_EMBEDDINGS_API_KEY", ""),
        context_embeddings_base_url=_env(dotenv, "CONTEXT_EMBEDDINGS_BASE_URL", ""),
        file_storage_provider=_env(dotenv, "FILE_STORAGE_PROVIDER", "local"),
        local_storage_path=_env(dotenv, "LOCAL_STORAGE_PATH", DEFAULT_LOCAL_STORAGE_PATH),
        s3_bucket_name=_env(dotenv, "S3_BUCKET_NAME", ""),
        s3_prefix=_env(dotenv, "S3_PREFIX", ""),
        s3_endpoint_url=_env(dotenv, "S3_ENDPOINT_URL", ""),
        s3_region=_env(dotenv, "S3_REGION", ""),
        s3_access_key_id=_env(dotenv, "S3_ACCESS_KEY_ID", ""),
        s3_secret_access_key=_env(dotenv, "S3_SECRET_ACCESS_KEY", ""),
        therapy_sessions_enabled=_env_bool(dotenv, "THERAPY_SESSIONS_ENABLED", True),
        therapy_max_upload_bytes=_env_int(dotenv, "THERAPY_MAX_UPLOAD_BYTES", 524_288_000),
        therapy_llm_provider=_env(dotenv, "THERAPY_LLM_PROVIDER", "auto"),
        therapy_llm_base_url=_env(dotenv, "THERAPY_LLM_BASE_URL", ""),
        therapy_llm_api_key=_env(dotenv, "THERAPY_LLM_API_KEY", ""),
        therapy_llm_model=_env(dotenv, "THERAPY_LLM_MODEL", "openai/gpt-4o"),
        therapy_whisper_model=_env(dotenv, "THERAPY_WHISPER_MODEL", "small"),
        therapy_whisper_device=_env(dotenv, "THERAPY_WHISPER_DEVICE", "cpu"),
        therapy_whisper_compute_type=_env(dotenv, "THERAPY_WHISPER_COMPUTE_TYPE", "int8"),
        therapy_diarization_enabled=_env_bool(dotenv, "THERAPY_DIARIZATION_ENABLED", True),
        therapy_num_speakers=_env_int(dotenv, "THERAPY_NUM_SPEAKERS", 2),
        hf_token=_env(dotenv, "HF_TOKEN", ""),
    )


settings = get_settings()
