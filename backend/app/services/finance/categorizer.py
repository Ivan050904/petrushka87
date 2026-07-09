from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.services.finance.ai_config import resolve_finance_ai_config
from app.services.finance.models import DEFAULT_FINANCE_CATEGORIES, FinanceAccount, ParsedTransaction

CATEGORIZE_PROMPT = """Categorize bank transactions for a personal finance app.
Return JSON only:
{"items":[{"index":0,"kind":"expense|income|transfer","category":"...","confidence":0.0}]}
Rules:
- Use only provided categories for expense/income rows.
- Internal transfers between the user's own accounts must be kind=transfer and category=null.
- If unsure, category="Прочее" and lower confidence.
- Do not invent new categories.
"""


class CategorizeInputItem(BaseModel):
    index: int = Field(ge=0)
    description: str
    amount: float = Field(gt=0)
    direction: str
    counterparty: str | None = None
    bank: str | None = None


class CategorizeOutputItem(BaseModel):
    index: int = Field(ge=0)
    kind: str
    category: str | None = None
    confidence: float = Field(ge=0, le=1)


class CategorizeResult(BaseModel):
    items: list[CategorizeOutputItem]


class FinanceAIUnavailableError(RuntimeError):
    pass


def categorize_transactions(
    transactions: list[ParsedTransaction],
    *,
    categories: list[str] | None = None,
    accounts: list[FinanceAccount] | None = None,
) -> list[ParsedTransaction]:
    config = resolve_finance_ai_config()
    if not config.ready:
        return transactions

    category_list = categories or DEFAULT_FINANCE_CATEGORIES
    account_labels = [account.label for account in accounts or []]
    batch_size = 40
    updated = list(transactions)

    for offset in range(0, len(updated), batch_size):
        chunk = updated[offset : offset + batch_size]
        payload_items = [
            CategorizeInputItem(
                index=index,
                description=item.description,
                amount=item.amount,
                direction=item.direction,
                counterparty=item.counterparty,
                bank=None,
            )
            for index, item in enumerate(chunk)
        ]
        result = _call_categorizer(
            config=config,
            items=payload_items,
            categories=category_list,
            account_labels=account_labels,
        )
        by_index = {item.index: item for item in result.items}
        for index, item in enumerate(chunk):
            suggestion = by_index.get(index)
            if suggestion is None:
                continue
            kind = suggestion.kind if suggestion.kind in {"expense", "income", "transfer"} else item.kind
            category = suggestion.category if kind != "transfer" else None
            updated[offset + index] = ParsedTransaction(
                transaction_date=item.transaction_date,
                amount=item.amount,
                direction=item.direction,
                description=item.description,
                counterparty=item.counterparty,
                currency=item.currency,
                kind=kind,  # type: ignore[arg-type]
                category=category,
                raw_row=item.raw_row,
                external_id=item.external_id,
                parser_note=item.parser_note,
            )
    return updated


def _call_categorizer(
    *,
    config,
    items: list[CategorizeInputItem],
    categories: list[str],
    account_labels: list[str],
) -> CategorizeResult:
    headers = {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }
    if config.provider == "github-models":
        headers["Accept"] = "application/vnd.github+json"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    user_payload: dict[str, Any] = {
        "categories": categories,
        "own_accounts": account_labels,
        "transactions": [item.model_dump() for item in items],
    }

    response = httpx.post(
        f"{config.base_url}/chat/completions",
        headers=headers,
        json={
            "model": config.model,
            "messages": [
                {"role": "system", "content": CATEGORIZE_PROMPT},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        },
        timeout=45,
    )
    response.raise_for_status()
    payload = response.json()
    try:
        content = str(payload["choices"][0]["message"]["content"])
        raw = json.loads(content)
        return CategorizeResult.model_validate(raw)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as exc:
        raise FinanceAIUnavailableError("AI categorization response was invalid") from exc
