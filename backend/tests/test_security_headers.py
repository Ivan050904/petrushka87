from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_api_responses_deny_iframe_embedding() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "frame-ancestors" not in (response.headers.get("Content-Security-Policy") or "")


def test_transcription_allows_frontend_iframe_embedding() -> None:
    with TestClient(app) as client:
        response = client.get(
            "/transcription/sso",
            headers={"Referer": "http://localhost:3000/transcription"},
            follow_redirects=False,
        )
    assert response.status_code in {302, 401}
    assert response.headers.get("X-Frame-Options") is None
    csp = response.headers.get("Content-Security-Policy") or ""
    assert "frame-ancestors" in csp
    assert "http://localhost:3000" in csp
