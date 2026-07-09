from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

FinanceKind = Literal["expense", "income", "transfer"]
FinanceBank = Literal["tinkoff", "sber", "alfa", "yandex", "ozon", "generic"]


@dataclass(slots=True)
class ParsedTransaction:
    transaction_date: str
    amount: float
    direction: Literal["income", "expense"]
    description: str
    counterparty: str | None = None
    currency: str = "RUB"
    kind: FinanceKind | None = None
    category: str | None = None
    raw_row: dict[str, Any] = field(default_factory=dict)
    external_id: str | None = None
    parser_note: str | None = None


@dataclass(slots=True)
class FinanceAccount:
    id: str
    bank: str
    label: str
    last4: str | None = None


DEFAULT_FINANCE_CATEGORIES = [
    "Продукты",
    "Транспорт",
    "Рестораны",
    "Подписки",
    "Жильё",
    "Здоровье",
    "Покупки",
    "Переводы",
    "Прочее",
]
