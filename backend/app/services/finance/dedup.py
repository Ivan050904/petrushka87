from __future__ import annotations

import hashlib
import re

CARD_MASK = re.compile(r"\*{2,}\d{4}")
AUTH_CODE = re.compile(r"\b\d{6}\b")


def normalize_description(text: str) -> str:
    cleaned = text.lower()
    cleaned = CARD_MASK.sub("", cleaned)
    cleaned = AUTH_CODE.sub("", cleaned)
    cleaned = cleaned.replace("операция по карте", "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:120]


def build_transaction_fingerprint(
    *,
    bank: str,
    account_id: str,
    transaction_date: str,
    amount: float,
    description: str,
) -> str:
    date = transaction_date[:10]
    normalized_amount = f"{amount:.2f}"
    normalized_description = normalize_description(description)
    payload = "|".join([bank, account_id, date, normalized_amount, normalized_description])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def fingerprint_from_metadata(metadata: dict) -> str | None:
    bank = metadata.get("bank")
    account_id = metadata.get("account_id")
    transaction_date = metadata.get("transaction_date")
    amount = metadata.get("amount")
    description = metadata.get("description")

    if not all(
        isinstance(value, str)
        for value in (bank, account_id, transaction_date, description)
    ):
        return None
    if not isinstance(amount, (int, float)):
        return None

    return build_transaction_fingerprint(
        bank=bank,
        account_id=account_id,
        transaction_date=transaction_date,
        amount=float(amount),
        description=description,
    )
