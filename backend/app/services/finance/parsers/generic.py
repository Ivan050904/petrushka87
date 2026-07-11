from __future__ import annotations

import csv
import io
import re
from datetime import datetime
from typing import Any

from app.services.finance.dedup import build_transaction_fingerprint
from app.services.finance.models import ParsedTransaction
from app.services.finance.parsers.base import BankStatementParser, ParserNotReadyError

DATE_COLUMN_HINTS = ("дата", "date", "дата операции", "дата проведения")
AMOUNT_COLUMN_HINTS = ("сумма", "amount", "сумма операции", "сумма в валюте")
DESCRIPTION_COLUMN_HINTS = ("описание", "description", "назначение", "категория", "merchant")
COUNTERPARTY_COLUMN_HINTS = ("контрагент", "counterparty", "получатель", "отправитель", "мерчант")
INCOME_HINTS = ("поступление", "зачисление", "доход", "income", "+")
EXPENSE_HINTS = ("списание", "расход", "expense", "-")

DATE_FORMATS = (
    "%d.%m.%Y",
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d.%m.%Y %H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%d.%m.%y",
)


def build_external_id(bank: str, account_id: str, transaction: ParsedTransaction) -> str:
    return build_transaction_fingerprint(
        bank=bank,
        account_id=account_id,
        transaction_date=transaction.transaction_date,
        amount=transaction.amount,
        description=transaction.description,
    )


def normalize_header(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def pick_column(headers: list[str], hints: tuple[str, ...]) -> str | None:
    normalized = {header: normalize_header(header) for header in headers}
    for header, lowered in normalized.items():
        if any(hint in lowered for hint in hints):
            return header
    return None


def parse_amount(value: str) -> float | None:
    cleaned = value.strip().replace("\u00a0", " ").replace(" ", "").replace(",", ".")
    cleaned = re.sub(r"[^\d.+-]", "", cleaned)
    if not cleaned or cleaned in {"+", "-"}:
        return None
    try:
        amount = abs(float(cleaned))
    except ValueError:
        return None
    return amount if amount > 0 else None


def parse_date(value: str) -> str | None:
    cleaned = value.strip()
    if not cleaned:
        return None
    for pattern in DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, pattern).date().isoformat()
        except ValueError:
            continue
    return None


def detect_direction(amount_text: str, description: str, explicit: str | None = None) -> str:
    if explicit:
        lowered = explicit.strip().lower()
        if any(hint in lowered for hint in INCOME_HINTS):
            return "income"
        if any(hint in lowered for hint in EXPENSE_HINTS):
            return "expense"
    if amount_text.strip().startswith("+"):
        return "income"
    if amount_text.strip().startswith("-"):
        return "expense"
    lowered = description.lower()
    if any(hint in lowered for hint in ("зарплат", "возврат", "cashback", "кэшбэк", "стипенд", "зачислен", "поступлен")):
        return "income"
    return "expense"


def decode_csv_content(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1251", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def read_csv_rows(content: bytes) -> list[dict[str, str]]:
    text = decode_csv_content(content)
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";" if sample.count(";") > sample.count(",") else ","

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        return []
    return [{key: (value or "").strip() for key, value in row.items() if key} for row in reader]


class GenericCsvParser(BankStatementParser):
    bank = "generic"
    ready = True

    def parse(self, content: bytes, filename: str) -> list[ParsedTransaction]:
        del filename
        rows = read_csv_rows(content)
        if not rows:
            return []

        headers = list(rows[0].keys())
        date_col = pick_column(headers, DATE_COLUMN_HINTS)
        amount_col = pick_column(headers, AMOUNT_COLUMN_HINTS)
        description_col = pick_column(headers, DESCRIPTION_COLUMN_HINTS)
        counterparty_col = pick_column(headers, COUNTERPARTY_COLUMN_HINTS)
        direction_col = pick_column(headers, ("тип", "direction", "операция", "вид операции"))

        if not date_col or not amount_col:
            raise ValueError("Не удалось определить колонки даты и суммы. Экспортируйте CSV или пришлите образец файла банка.")

        parsed: list[ParsedTransaction] = []
        for row in rows:
            date_value = parse_date(row.get(date_col, ""))
            amount_value = parse_amount(row.get(amount_col, ""))
            if not date_value or amount_value is None:
                continue

            description = row.get(description_col or "", "").strip()
            if not description:
                description = row.get(counterparty_col or "", "").strip() or "Операция"

            direction = detect_direction(
                row.get(amount_col, ""),
                description,
                row.get(direction_col or "", "") if direction_col else None,
            )
            counterparty = row.get(counterparty_col or "", "").strip() or None

            parsed.append(
                ParsedTransaction(
                    transaction_date=date_value,
                    amount=amount_value,
                    direction=direction,  # type: ignore[arg-type]
                    description=description,
                    counterparty=counterparty,
                    raw_row=row,
                    parser_note="generic",
                )
            )
        return parsed


class StubBankParser(BankStatementParser):
    def __init__(self, bank: str, label: str) -> None:
        self.bank = bank
        self.label = label
        self.ready = False

    def parse(self, content: bytes, filename: str) -> list[ParsedTransaction]:
        del content, filename
        raise ParserNotReadyError(
            self.bank,
            f"Парсер {self.label} подключим, когда пришлёте образец выписки. Пока используйте «Универсальный CSV».",
        )
