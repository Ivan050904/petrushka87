from __future__ import annotations

from app.services.finance.dedup import build_transaction_fingerprint, normalize_description


def test_normalize_description_strips_card_and_auth() -> None:
    assert normalize_description("Стипендия. Операция по карте ****3295 678601") == "стипендия."


def test_build_transaction_fingerprint_is_stable() -> None:
    first = build_transaction_fingerprint(
        bank="sber",
        account_id="acc-1",
        transaction_date="2026-07-05",
        amount=3000.0,
        description="Стипендия учащимся",
    )
    second = build_transaction_fingerprint(
        bank="sber",
        account_id="acc-1",
        transaction_date="2026-07-05",
        amount=3000.0,
        description="стипендия учащимся",
    )
    assert first == second
    assert len(first) == 32
