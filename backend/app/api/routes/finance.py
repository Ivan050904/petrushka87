from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.entry import Entry
from app.models.user import User
from app.schemas.entry import EntryType
from app.schemas.finance import (
    FinanceAIStatusRead,
    FinanceCategorizeRead,
    FinanceCategorizeRequest,
    FinanceImportConfirmRead,
    FinanceImportConfirmRequest,
    FinanceImportPreviewRead,
    FinanceImportRow,
    FinanceSummaryCategory,
    FinanceSummaryRead,
)
from app.schemas.metadata import normalize_metadata
from app.services.finance.ai_config import resolve_finance_ai_config
from app.services.finance.categorizer import FinanceAIUnavailableError, categorize_transactions
from app.services.finance.models import DEFAULT_FINANCE_CATEGORIES, FinanceAccount, ParsedTransaction
from app.services.finance.parser_registry import parser_registry
from app.services.finance.parsers.generic import build_external_id
from app.services.finance.transfer_detector import apply_transfer_pairs, apply_transfer_rules

router = APIRouter()


def _row_from_parsed(item: ParsedTransaction) -> FinanceImportRow:
    return FinanceImportRow(
        transaction_date=item.transaction_date,
        amount=item.amount,
        direction=item.direction,
        description=item.description,
        counterparty=item.counterparty,
        currency=item.currency,
        kind=item.kind,
        category=item.category,
        external_id=item.external_id,
        parser_note=item.parser_note,
    )


def _parsed_from_row(item: FinanceImportRow) -> ParsedTransaction:
    return ParsedTransaction(
        transaction_date=item.transaction_date,
        amount=item.amount,
        direction=item.direction,
        description=item.description,
        counterparty=item.counterparty,
        currency=item.currency,
        kind=item.kind,
        category=item.category,
        external_id=item.external_id,
        parser_note=item.parser_note,
    )


def _accounts_from_payload(accounts: list) -> list[FinanceAccount]:
    return [
        FinanceAccount(id=account.id, bank=account.bank, label=account.label, last4=account.last4)
        for account in accounts
    ]


def _existing_external_ids(db: Session, user_id: uuid.UUID) -> set[str]:
    statement = select(Entry.metadata_).where(
        Entry.user_id == user_id,
        Entry.type == EntryType.finance.value,
    )
    rows = db.execute(statement).scalars().all()
    result: set[str] = set()
    for metadata in rows:
        external_id = metadata.get("external_id")
        if isinstance(external_id, str) and external_id:
            result.add(external_id)
    return result


@router.get("/ai-status", response_model=FinanceAIStatusRead)
def finance_ai_status(current_user: User = Depends(get_current_user)) -> FinanceAIStatusRead:
    del current_user
    config = resolve_finance_ai_config()
    return FinanceAIStatusRead(
        provider=config.provider,
        model=config.model,
        ready=config.ready,
        message=config.message,
    )


@router.post("/import/preview", response_model=FinanceImportPreviewRead)
async def finance_import_preview(
    bank: str = Form(...),
    account_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FinanceImportPreviewRead:
    if bank not in {"tinkoff", "sber", "alfa", "yandex", "ozon", "generic"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown bank")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File is empty")

    filename = file.filename or "statement.csv"
    if filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="XLSX пока не поддерживается. Экспортируйте выписку в CSV.",
        )

    try:
        parsed, warning = parser_registry.parse(bank, content, filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Не удалось разобрать файл: {exc}",
        ) from exc

    for item in parsed:
        item.external_id = build_external_id(bank, account_id, item)

    parsed = apply_transfer_rules(parsed)
    parsed = apply_transfer_pairs(parsed)

    existing = _existing_external_ids(db, current_user.id)
    rows: list[FinanceImportRow] = []
    duplicates = 0
    for item in parsed:
        if item.external_id in existing:
            duplicates += 1
            continue
        rows.append(_row_from_parsed(item))

    return FinanceImportPreviewRead(
        bank=bank,  # type: ignore[arg-type]
        account_id=account_id,
        parser=bank if warning is None else "generic",
        parser_warning=warning,
        rows=rows,
        duplicates=duplicates,
    )


@router.post("/import/confirm", response_model=FinanceImportConfirmRead)
def finance_import_confirm(
    payload: FinanceImportConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FinanceImportConfirmRead:
    existing = _existing_external_ids(db, current_user.id)
    import_batch_id = str(uuid.uuid4())
    created = 0
    skipped = 0

    for row in payload.rows:
        external_id = row.external_id or build_external_id(
            payload.bank,
            payload.account_id,
            _parsed_from_row(row),
        )
        if external_id in existing:
            skipped += 1
            continue

        kind = row.kind or row.direction
        metadata: dict[str, Any] = {
            "amount": row.amount,
            "direction": row.direction,
            "currency": row.currency,
            "description": row.description,
            "kind": kind,
            "category": row.category,
            "account_id": payload.account_id,
            "bank": payload.bank,
            "transaction_date": row.transaction_date,
            "counterparty": row.counterparty,
            "external_id": external_id,
            "import_batch_id": import_batch_id,
            "source": "bank_import",
        }
        metadata = normalize_metadata(EntryType.finance, metadata)
        title = (row.title or row.description)[:160] or "Операция"
        entry = Entry(
            user_id=current_user.id,
            type=EntryType.finance.value,
            title=title,
            content=row.description,
            metadata_=metadata,
        )
        db.add(entry)
        existing.add(external_id)
        created += 1

    db.commit()
    return FinanceImportConfirmRead(created=created, skipped_duplicates=skipped)


@router.post("/categorize", response_model=FinanceCategorizeRead)
def finance_categorize(
    payload: FinanceCategorizeRequest,
    current_user: User = Depends(get_current_user),
) -> FinanceCategorizeRead:
    del current_user
    config = resolve_finance_ai_config()
    if not config.ready:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=config.message)

    parsed = [_parsed_from_row(row) for row in payload.rows]
    categories = payload.categories or DEFAULT_FINANCE_CATEGORIES
    accounts = _accounts_from_payload(payload.accounts)

    try:
        categorized = categorize_transactions(parsed, categories=categories, accounts=accounts)
    except FinanceAIUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="ИИ не смог категоризировать операции",
        ) from exc

    return FinanceCategorizeRead(rows=[_row_from_parsed(item) for item in categorized])


@router.get("/summary", response_model=FinanceSummaryRead)
def finance_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
) -> FinanceSummaryRead:
    statement = select(Entry).where(
        Entry.user_id == current_user.id,
        Entry.type == EntryType.finance.value,
    )
    entries = db.execute(statement).scalars().all()

    income = 0.0
    expense = 0.0
    transfers = 0
    by_expense_category: dict[str, float] = defaultdict(float)
    by_income_category: dict[str, float] = defaultdict(float)

    for entry in entries:
        metadata = entry.metadata_
        kind = metadata.get("kind")
        direction = metadata.get("direction")
        amount = float(metadata.get("amount") or 0)
        transaction_date = metadata.get("transaction_date")
        if date_from and isinstance(transaction_date, str) and transaction_date < date_from:
            continue
        if date_to and isinstance(transaction_date, str) and transaction_date > date_to:
            continue

        if kind == "transfer":
            transfers += 1
            continue

        effective_kind = kind or direction
        if effective_kind == "income":
            income += amount
            category = metadata.get("category") or "Прочее"
            if isinstance(category, str):
                by_income_category[category] += amount
            continue
        if effective_kind == "expense":
            expense += amount
            category = metadata.get("category") or "Прочее"
            if isinstance(category, str):
                by_expense_category[category] += amount

    expense_categories = [
        FinanceSummaryCategory(category=category, total=total)
        for category, total in sorted(by_expense_category.items(), key=lambda item: item[1], reverse=True)
    ]
    income_categories = [
        FinanceSummaryCategory(category=category, total=total)
        for category, total in sorted(by_income_category.items(), key=lambda item: item[1], reverse=True)
    ]

    return FinanceSummaryRead(
        income=income,
        expense=expense,
        balance=income - expense,
        transfers=transfers,
        by_category=expense_categories,
        by_expense_category=expense_categories,
        by_income_category=income_categories,
    )
