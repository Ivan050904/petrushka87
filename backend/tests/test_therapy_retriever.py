from __future__ import annotations

import uuid
from unittest.mock import MagicMock

from app.services.context.context_models import infer_scopes_from_query
from app.services.context.retrievers.therapy import retrieve


def test_infer_scopes_from_query_includes_therapy() -> None:
    scopes = infer_scopes_from_query("что было на сессии с психологом про защитные механизмы")
    assert "therapy" in scopes


def test_therapy_retriever_returns_done_jobs() -> None:
    db = MagicMock()
    job = MagicMock()
    job.id = 7
    job.entry_id = uuid.uuid4()
    job.title = "Сессия 2026-07-01"
    job.source_filename = "session.mp3"
    job.analysis_markdown = "Краткий пересказ сессии"
    job.diarized_transcript = "[00:01] Клиент: привет"
    job.transcript = "привет"
    job.analysis_json = {"session_summary": "summary", "emotional_dynamics": "calm"}
    job.session_date = None
    job.status = "done"

    db.scalars.return_value.all.return_value = [job]

    from app.services.context.query_intent import QueryIntent

    snippets = retrieve(
        db,
        uuid.uuid4(),
        "психолог",
        intent=QueryIntent(scopes=["therapy"]),
        limit=5,
    )
    assert len(snippets) == 1
    assert snippets[0].source == "therapy"
    assert snippets[0].job_id == 7
