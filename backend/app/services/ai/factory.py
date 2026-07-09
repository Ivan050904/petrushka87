from __future__ import annotations

from app.core.config import settings
from app.services.ai.base import AIClient
from app.services.ai.openai_compatible import OpenAICompatibleClient
from app.services.ai.yandex_ai_studio import YandexAIStudioClient


def get_ai_client() -> AIClient | None:
    if not settings.ai_classification_enabled:
        return None

    if settings.ai_provider == "openai-compatible":
        if not settings.openai_compatible_api_key or not settings.openai_compatible_model:
            return None
        return OpenAICompatibleClient()

    if settings.ai_provider == "yandex":
        if (
            not settings.yandex_cloud_api_key
            or not settings.yandex_cloud_folder_id
            or not settings.yandex_cloud_model
        ):
            return None
        return YandexAIStudioClient()

    return None
