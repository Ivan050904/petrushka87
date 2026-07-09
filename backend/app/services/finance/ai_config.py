from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings

GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference"
GITHUB_DEFAULT_MODEL = "openai/gpt-4o-mini"
OPENAI_DEFAULT_MODEL = "gpt-4o-mini"


def _is_github_token(token: str) -> bool:
    return token.startswith(("github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"))


@dataclass(frozen=True, slots=True)
class FinanceAIConfig:
    provider: str
    model: str
    base_url: str
    api_key: str
    ready: bool
    message: str


def resolve_finance_ai_config() -> FinanceAIConfig:
    if not settings.finance_ai_enabled:
        return FinanceAIConfig(
            provider="disabled",
            model="",
            base_url="",
            api_key="",
            ready=False,
            message="ИИ для финансов отключён (FINANCE_AI_ENABLED=false).",
        )

    api_key = settings.finance_ai_api_key or settings.openai_compatible_api_key
    if not api_key:
        return FinanceAIConfig(
            provider="none",
            model="",
            base_url="",
            api_key="",
            ready=False,
            message="Добавьте OPENAI_COMPATIBLE_API_KEY или FINANCE_AI_API_KEY в backend/.env",
        )

    if _is_github_token(api_key):
        model = settings.finance_ai_model or settings.openai_compatible_model or GITHUB_DEFAULT_MODEL
        return FinanceAIConfig(
            provider="github-models",
            model=model,
            base_url=GITHUB_MODELS_BASE_URL,
            api_key=api_key,
            ready=True,
            message="GitHub Models готов к категоризации выписок.",
        )

    base_url = settings.finance_ai_base_url or settings.openai_compatible_base_url
    model = settings.finance_ai_model or settings.openai_compatible_model or OPENAI_DEFAULT_MODEL
    if not model:
        return FinanceAIConfig(
            provider="openai-compatible",
            model="",
            base_url=base_url,
            api_key=api_key,
            ready=False,
            message="Укажите OPENAI_COMPATIBLE_MODEL или FINANCE_AI_MODEL в backend/.env",
        )

    return FinanceAIConfig(
        provider="openai-compatible",
        model=model,
        base_url=base_url.rstrip("/"),
        api_key=api_key,
        ready=True,
        message="OpenAI-compatible провайдер готов к категоризации выписок.",
    )
