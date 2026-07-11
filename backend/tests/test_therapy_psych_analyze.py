from __future__ import annotations

import pytest

from app.schemas.therapy_session import TherapySessionAnalysis
from app.services.therapy_sessions.analysis_markdown import analysis_to_markdown


def test_therapy_analysis_schema_accepts_minimal_payload() -> None:
    payload = {
        "session_summary": "Клиент обсуждал тревогу на работе.",
        "key_topics": ["тревога"],
        "problems": [
            {
                "thesis": "Страх ошибки",
                "evidence": "Я боюсь, что меня уволят",
                "speaker": "client",
            }
        ],
        "defense_mechanisms": [
            {
                "name": "рационализация",
                "description": "Объясняет чувства логикой",
                "evidence": "Ну это же нормально переживать",
                "speaker": "client",
            }
        ],
        "emotional_dynamics": "От напряжения к облегчению",
        "client_patterns": ["самокритика"],
        "therapist_interventions": ["уточняющий вопрос"],
        "insights": ["страх связан с оценкой"],
        "homework_or_next_steps": ["вести дневник тревоги"],
        "open_questions": ["что запускает пик тревоги"],
        "confidence_notes": "diarization мог перепутать спикеров",
    }
    analysis = TherapySessionAnalysis.model_validate(payload)
    markdown = analysis_to_markdown(analysis)
    assert "Краткий пересказ" in markdown
    assert "Защитные механизмы" in markdown
    assert analysis.problems[0].thesis == "Страх ошибки"


def test_therapy_analysis_schema_requires_summary() -> None:
    with pytest.raises(Exception):
        TherapySessionAnalysis.model_validate({"key_topics": []})
