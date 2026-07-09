from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

FinanceBankCode = Literal["tinkoff", "sber", "alfa", "yandex", "ozon", "generic"]
FinanceKindCode = Literal["expense", "income", "transfer"]


class FinanceAccountSchema(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    bank: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=120)
    last4: str | None = Field(default=None, max_length=4)


class FinanceSettingsSchema(BaseModel):
    accounts: list[FinanceAccountSchema] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)


class FinanceAIStatusRead(BaseModel):
    provider: str
    model: str
    ready: bool
    message: str


class FinanceImportRow(BaseModel):
    transaction_date: str
    amount: float = Field(gt=0)
    direction: Literal["income", "expense"]
    description: str = Field(min_length=1, max_length=500)
    counterparty: str | None = None
    currency: str = Field(default="RUB", min_length=3, max_length=3)
    kind: FinanceKindCode | None = None
    category: str | None = None
    external_id: str | None = None
    parser_note: str | None = None


class FinanceImportPreviewRead(BaseModel):
    bank: FinanceBankCode
    account_id: str
    parser: str
    parser_warning: str | None = None
    rows: list[FinanceImportRow]
    duplicates: int = 0


class FinanceImportConfirmRequest(BaseModel):
    bank: FinanceBankCode
    account_id: str = Field(min_length=1, max_length=64)
    rows: list[FinanceImportRow] = Field(min_length=1, max_length=5000)


class FinanceImportConfirmRead(BaseModel):
    created: int
    skipped_duplicates: int


class FinanceCategorizeRequest(BaseModel):
    rows: list[FinanceImportRow] = Field(min_length=1, max_length=200)
    categories: list[str] = Field(default_factory=list)
    accounts: list[FinanceAccountSchema] = Field(default_factory=list)


class FinanceCategorizeRead(BaseModel):
    rows: list[FinanceImportRow]


class FinanceSummaryCategory(BaseModel):
    category: str
    total: float


class FinanceSummaryRead(BaseModel):
    income: float
    expense: float
    balance: float
    transfers: int
    by_category: list[FinanceSummaryCategory]
