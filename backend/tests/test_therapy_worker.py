from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.therapy_sessions.worker import process_therapy_session_job


@pytest.fixture
def mock_db_session() -> tuple[MagicMock, MagicMock]:
    db = MagicMock()
    job = MagicMock()
    job.id = 1
    job.file_storage_key = "file-key"
    job.source_filename = "session.mp3"
    job.duration_sec = 0
    job.reprocess_mode = "analysis"
    job.transcript = "plain transcript"
    job.diarized_transcript = "[00:01] Клиент: hello"
    job.session_date = None
    job.entry_id = None
    db.get.return_value = job
    return db, job


@patch("app.services.therapy_sessions.worker.SessionLocal")
@patch("app.services.therapy_sessions.worker.get_file_storage")
@patch("app.services.therapy_sessions.worker.index_therapy_session")
@patch("app.services.therapy_sessions.worker.sync_entry_for_job")
@patch("app.services.therapy_sessions.worker.analyze_therapy_session")
@patch("app.services.therapy_sessions.worker.current_model_name", return_value="test-model")
def test_process_job_analysis_only_skips_transcription(
    _model_name: MagicMock,
    analyze_mock: MagicMock,
    sync_mock: MagicMock,
    index_mock: MagicMock,
    storage_mock: MagicMock,
    session_local: MagicMock,
    mock_db_session: tuple[MagicMock, MagicMock],
) -> None:
    db, job = mock_db_session
    session_local.return_value = db
    storage_mock.return_value.open.side_effect = AssertionError("should not open file in analysis mode")

    from app.schemas.therapy_session import TherapySessionAnalysis

    analyze_mock.return_value = TherapySessionAnalysis(
        session_summary="summary",
        key_topics=[],
        problems=[],
        defense_mechanisms=[],
        emotional_dynamics="",
        client_patterns=[],
        therapist_interventions=[],
        insights=[],
        homework_or_next_steps=[],
        open_questions=[],
        confidence_notes="",
    )

    process_therapy_session_job(1)

    analyze_mock.assert_called_once()
    sync_mock.assert_called_once()
    index_mock.assert_called_once()
    assert job.status == "done"


@patch("app.services.therapy_sessions.worker.SessionLocal")
@patch("app.services.therapy_sessions.worker.get_file_storage")
@patch("app.services.therapy_sessions.worker.index_therapy_session")
@patch("app.services.therapy_sessions.worker.sync_entry_for_job")
@patch("app.services.therapy_sessions.worker.analyze_therapy_session")
@patch("app.services.therapy_sessions.worker.llm_diarize_plain_transcript", return_value="Клиент: hello")
@patch("app.services.therapy_sessions.worker.current_model_name", return_value="test-model")
def test_process_job_text_import_keeps_diarized_transcript_after_progress_updates(
    _model_name: MagicMock,
    diarize_mock: MagicMock,
    analyze_mock: MagicMock,
    sync_mock: MagicMock,
    index_mock: MagicMock,
    storage_mock: MagicMock,
    session_local: MagicMock,
) -> None:
    db = MagicMock()
    job = MagicMock()
    job.id = 2
    job.file_storage_key = ""
    job.source_filename = "session.txt"
    job.duration_sec = 0
    job.reprocess_mode = ""
    job.transcript = "plain imported text"
    job.transcription_source = "text"
    job.diarized_transcript = ""
    job.session_date = None
    job.entry_id = None
    persisted: dict[str, str] = {"diarized_transcript": ""}

    def flush_side_effect() -> None:
        persisted["diarized_transcript"] = job.diarized_transcript

    def refresh_side_effect(_job: MagicMock) -> None:
        _job.diarized_transcript = persisted["diarized_transcript"]

    db.get.return_value = job
    db.flush.side_effect = flush_side_effect
    db.refresh.side_effect = refresh_side_effect
    session_local.return_value = db
    storage_mock.return_value.open.side_effect = AssertionError("should not open file for text import")

    from app.schemas.therapy_session import TherapySessionAnalysis

    analyze_mock.return_value = TherapySessionAnalysis(
        session_summary="summary",
        key_topics=[],
        problems=[],
        defense_mechanisms=[],
        emotional_dynamics="",
        client_patterns=[],
        therapist_interventions=[],
        insights=[],
        homework_or_next_steps=[],
        open_questions=[],
        confidence_notes="",
    )

    process_therapy_session_job(2)

    diarize_mock.assert_called_once_with("plain imported text")
    analyze_mock.assert_called_once_with(
        "Клиент: hello",
        duration_sec=0,
        on_progress=analyze_mock.call_args.kwargs["on_progress"],
    )
    assert job.status == "done"
