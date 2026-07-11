from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.transcription import TranscriptionJob
from app.models.user import User
from transcription.pipeline.worker import _format_job_error, process_job


def test_format_job_error_github_429() -> None:
    message = _format_job_error(Exception("429 Too Many Requests"))
    assert "GitHub Models" in message
    assert "OPENAI_API_KEY" in message


def test_format_job_error_youtube_timeout() -> None:
    message = _format_job_error(Exception("Unable to download webpage: youtube.com timed out"))
    assert "YouTube" in message


@pytest.fixture()
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'worker.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    user = User(
        id=uuid.uuid4(),
        email="worker@example.com",
        full_name="Worker",
        hashed_password="hash",
    )
    session.add(user)
    session.commit()
    yield session, session_factory
    session.close()
    engine.dispose()


@patch("transcription.pipeline.worker.index_transcription_job")
@patch("transcription.pipeline.worker.sync_entry_for_job")
@patch("transcription.pipeline.worker.opinions.extract_opinions", return_value="opinions")
@patch("transcription.pipeline.worker.summarize.summarize", return_value="summary text")
@patch("transcription.pipeline.worker.subtitles.fetch_subtitles", return_value="transcript line")
@patch("transcription.pipeline.worker.subtitles.get_video_info")
@patch("transcription.pipeline.worker.SessionLocal")
def test_process_job_subtitle_path(
    mock_session_local: MagicMock,
    mock_get_video_info: MagicMock,
    mock_fetch_subtitles: MagicMock,
    mock_summarize: MagicMock,
    mock_opinions: MagicMock,
    mock_sync: MagicMock,
    mock_index: MagicMock,
    db_session: tuple[Session, sessionmaker],
) -> None:
    session, session_factory = db_session
    mock_session_local.return_value = session
    mock_get_video_info.return_value = {"title": "Test video", "duration": 120}

    job = TranscriptionJob(user_id=session.query(User).one().id, url="https://youtube.com/watch?v=test")
    session.add(job)
    session.commit()
    job_id = job.id

    process_job(job_id)

    with session_factory() as check:
        updated = check.get(TranscriptionJob, job_id)
        assert updated is not None
        assert updated.status == "done"
        assert updated.transcript == "transcript line"
        assert updated.summary == "summary text"
        assert updated.progress == 100
    mock_fetch_subtitles.assert_called_once()
    mock_summarize.assert_called_once()


@patch("transcription.pipeline.worker.SessionLocal")
def test_process_job_sets_friendly_error_on_429(mock_session_local: MagicMock, db_session: tuple[Session, sessionmaker]) -> None:
    session, session_factory = db_session
    mock_session_local.return_value = session
    user = session.query(User).one()

    job = TranscriptionJob(user_id=user.id, url="https://youtube.com/watch?v=err")
    session.add(job)
    session.commit()
    job_id = job.id

    with patch("transcription.pipeline.worker.subtitles.get_video_info", side_effect=Exception("429 Too Many Requests")):
        process_job(job_id)

    with session_factory() as check:
        updated = check.get(TranscriptionJob, job_id)
        assert updated is not None
        assert updated.status == "error"
        assert "OPENAI_API_KEY" in updated.error
