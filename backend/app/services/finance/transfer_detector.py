from __future__ import annotations

import re

from app.services.finance.models import FinanceAccount, ParsedTransaction

TRANSFER_PATTERNS = (
    r"перевод",
    r"между\s+своими",
    r"на\s+свой",
    r"сбп\s+себе",
    r"перевод\s+средств",
    r"transfer\s+between",
    r"own\s+account",
)


def _looks_like_transfer(description: str, counterparty: str | None) -> bool:
    haystack = f"{description} {counterparty or ''}".lower()
    return any(re.search(pattern, haystack) for pattern in TRANSFER_PATTERNS)


def apply_transfer_rules(
    transactions: list[ParsedTransaction],
    accounts: list[FinanceAccount] | None = None,
) -> list[ParsedTransaction]:
    del accounts
    updated: list[ParsedTransaction] = []
    for item in transactions:
        if item.kind == "transfer":
            updated.append(item)
            continue
        if _looks_like_transfer(item.description, item.counterparty):
            updated.append(
                ParsedTransaction(
                    transaction_date=item.transaction_date,
                    amount=item.amount,
                    direction=item.direction,
                    description=item.description,
                    counterparty=item.counterparty,
                    currency=item.currency,
                    kind="transfer",
                    category=item.category,
                    raw_row=item.raw_row,
                    external_id=item.external_id,
                    parser_note=item.parser_note,
                )
            )
            continue
        updated.append(item)
    return updated


def apply_transfer_pairs(
    transactions: list[ParsedTransaction],
    window_days: int = 1,
) -> list[ParsedTransaction]:
    from datetime import date

    def parse_day(value: str) -> date | None:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None

    indexed = list(enumerate(transactions))
    transfer_ids: set[int] = set()

    for left_index, left in indexed:
        if left.kind == "transfer":
            continue
        left_day = parse_day(left.transaction_date)
        if left_day is None:
            continue
        for right_index, right in indexed:
            if right_index <= left_index or right.kind == "transfer":
                continue
            right_day = parse_day(right.transaction_date)
            if right_day is None:
                continue
            if abs((left_day - right_day).days) > window_days:
                continue
            if abs(left.amount - right.amount) > 0.01:
                continue
            if left.direction == right.direction:
                continue
            transfer_ids.add(left_index)
            transfer_ids.add(right_index)

    result: list[ParsedTransaction] = []
    for index, item in indexed:
        if index not in transfer_ids:
            result.append(item)
            continue
        result.append(
            ParsedTransaction(
                transaction_date=item.transaction_date,
                amount=item.amount,
                direction=item.direction,
                description=item.description,
                counterparty=item.counterparty,
                currency=item.currency,
                kind="transfer",
                category=item.category,
                raw_row=item.raw_row,
                external_id=item.external_id,
                parser_note=item.parser_note,
            )
        )
    return result
