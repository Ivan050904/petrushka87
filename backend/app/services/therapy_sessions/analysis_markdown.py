from __future__ import annotations

from app.schemas.therapy_session import TherapySessionAnalysis


def analysis_to_markdown(analysis: TherapySessionAnalysis) -> str:
    lines: list[str] = [
        "## Краткий пересказ",
        analysis.session_summary,
        "",
    ]

    if analysis.key_topics:
        lines.extend(["## Ключевые темы", *[f"- {item}" for item in analysis.key_topics], ""])

    if analysis.problems:
        lines.append("## Проблемы и запросы")
        for item in analysis.problems:
            lines.append(f"- **{item.thesis}**")
            lines.append(f"  > {item.evidence}")
        lines.append("")

    if analysis.defense_mechanisms:
        lines.append("## Защитные механизмы")
        for item in analysis.defense_mechanisms:
            lines.append(f"- **{item.name}** — {item.description}")
            lines.append(f"  > {item.evidence}")
        lines.append("")

    if analysis.emotional_dynamics:
        lines.extend(["## Эмоциональная динамика", analysis.emotional_dynamics, ""])

    if analysis.client_patterns:
        lines.extend(["## Паттерны клиента", *[f"- {item}" for item in analysis.client_patterns], ""])

    if analysis.therapist_interventions:
        lines.extend(
            ["## Интервенции терапевта", *[f"- {item}" for item in analysis.therapist_interventions], ""]
        )

    if analysis.insights:
        lines.extend(["## Инсайты", *[f"- {item}" for item in analysis.insights], ""])

    if analysis.homework_or_next_steps:
        lines.extend(["## Домашнее задание и следующие шаги", *[f"- {item}" for item in analysis.homework_or_next_steps], ""])

    if analysis.open_questions:
        lines.extend(["## Открытые вопросы", *[f"- {item}" for item in analysis.open_questions], ""])

    if analysis.confidence_notes:
        lines.extend(["## Ограничения анализа", analysis.confidence_notes, ""])

    lines.append(
        "_Это вспомогательный разбор на основе расшифровки. "
        "Не заменяет профессиональную супервизию или диагностику._"
    )
    return "\n".join(lines).strip()
