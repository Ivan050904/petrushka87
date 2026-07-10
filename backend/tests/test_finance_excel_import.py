from __future__ import annotations

from pathlib import Path

import pytest
from openpyxl import Workbook

from app.services.finance_excel_import import (
    build_external_id,
    parse_finance_workbook,
    sheet_to_transaction_date,
)


def _write_fixture_workbook(path: Path) -> None:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Апрель"
    worksheet.append(["расходы", None, "доходы", None])
    worksheet.append(["такси", 500, "зарплата", 10000])
    worksheet.append([5, 1200, None, None])
    worksheet.append(["кофе", 250, "кэшбэк", 120])

    extra = workbook.create_sheet("04.2026")
    extra.append(["расходы", None, "доходы", None])
    extra.append(["пицца", 900, "зп март", 18000])

    workbook.save(path)


def test_sheet_to_transaction_date_named_and_numeric() -> None:
    assert sheet_to_transaction_date("Апрель") == "2025-04-30"
    assert sheet_to_transaction_date("04.2026") == "2026-04-30"
    assert sheet_to_transaction_date("Февраль") == "2026-02-28"


def test_build_external_id_is_stable() -> None:
    first = build_external_id(
        sheet_name="Апрель",
        row_number=2,
        side="expense",
        category="такси",
        amount=500,
    )
    second = build_external_id(
        sheet_name="Апрель",
        row_number=2,
        side="expense",
        category="такси",
        amount=500,
    )
    assert first == second


def test_parse_finance_workbook_skips_numeric_categories(tmp_path: Path) -> None:
    file_path = tmp_path / "finance.xlsx"
    _write_fixture_workbook(file_path)

    parsed = parse_finance_workbook(file_path)

    assert parsed.sheet_count == 2
    assert parsed.expense_count == 3
    assert parsed.income_count == 3
    assert "такси" in parsed.categories
    assert "зарплата" in parsed.categories
    assert all(row.category != "5" for row in parsed.rows)
    assert parsed.rows[0].transaction_date == "2025-04-30"
    assert parsed.rows[-1].sheet_name == "04.2026"


def test_parse_finance_workbook_requires_existing_file(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        parse_finance_workbook(tmp_path / "missing.xlsx")
