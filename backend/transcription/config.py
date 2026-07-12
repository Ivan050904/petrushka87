from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.token_sources import is_github_token, read_desktop_token

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = BACKEND_ROOT / "storage" / "transcription"

GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference"
OPENAI_BASE_URL = "https://api.openai.com/v1"
GITHUB_DEFAULT_MODEL = "openai/gpt-4o-mini"
OPENAI_DEFAULT_MODEL = "gpt-4o-mini"


class Settings(BaseSettings):
    """Настройки модуля транскрибации YouTube."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    secret_key: str = Field(default="", validation_alias="SECRET_KEY")
    url_prefix: str = Field(default="/transcription", validation_alias="TRANSCRIPTION_URL_PREFIX")

    llm_provider: str = Field(default="", validation_alias="TRANSCRIPTION_LLM_PROVIDER")
    llm_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    openai_compatible_api_key: str = Field(default="", validation_alias="OPENAI_COMPATIBLE_API_KEY")
    llm_base_url: str = Field(default="", validation_alias="TRANSCRIPTION_LLM_BASE_URL")
    llm_model: str = Field(default="", validation_alias="TRANSCRIPTION_LLM_MODEL")
    llm_retry_max: int = Field(default=5, validation_alias="TRANSCRIPTION_LLM_RETRY_MAX")
    llm_retry_base_delay: float = Field(default=2.0, validation_alias="TRANSCRIPTION_LLM_RETRY_BASE_DELAY")
    llm_request_pause_sec: float = Field(default=0.0, validation_alias="TRANSCRIPTION_LLM_REQUEST_PAUSE_SEC")

    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    default_language: str = "ru"

    transcription_data_dir: str = Field(
        default=str(DEFAULT_DATA_DIR),
        validation_alias="TRANSCRIPTION_DATA_DIR",
    )

    ytdlp_cookies_from_browser: str = Field(
        default="auto",
        validation_alias="YTDLP_COOKIES_FROM_BROWSER",
    )
    ytdlp_cookies_file: str = Field(default="", validation_alias="YTDLP_COOKIES_FILE")

    eta_metadata_sec: int = 5
    eta_subtitles_sec: int = 20
    eta_whisper_factor: float = 0.4
    eta_summary_factor: float = 0.15
    eta_summary_min_sec: int = 30
    eta_opinions_factor: float = 0.1
    eta_opinions_min_sec: int = 20

    @model_validator(mode="after")
    def _configure_llm(self) -> "Settings":
        if not self.llm_api_key:
            if self.openai_compatible_api_key:
                self.llm_api_key = self.openai_compatible_api_key
            else:
                desktop = read_desktop_token()
                if desktop:
                    self.llm_api_key = desktop

        if not self.llm_provider:
            if self.llm_api_key and is_github_token(self.llm_api_key):
                self.llm_provider = "github"
            else:
                self.llm_provider = "openai"

        if not self.llm_base_url:
            self.llm_base_url = GITHUB_MODELS_BASE_URL if self.llm_provider == "github" else OPENAI_BASE_URL

        if not self.llm_model:
            self.llm_model = GITHUB_DEFAULT_MODEL if self.llm_provider == "github" else OPENAI_DEFAULT_MODEL

        if self.llm_provider == "github" and self.llm_request_pause_sec <= 0:
            self.llm_request_pause_sec = 2.5

        if not self.secret_key:
            from app.core.config import settings as app_settings

            self.secret_key = app_settings.secret_key

        return self

    @property
    def openai_api_key(self) -> str:
        return self.llm_api_key

    @property
    def openai_model(self) -> str:
        return self.llm_model

    @property
    def data_path(self) -> Path:
        path = Path(self.transcription_data_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def tmp_path(self) -> Path:
        path = self.data_path / "tmp"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def root_path(self) -> str:
        return self.url_prefix.rstrip("/")


settings = Settings()
