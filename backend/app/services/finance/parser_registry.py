from __future__ import annotations

from app.services.finance.parsers.base import BankStatementParser, ParserNotReadyError
from app.services.finance.parsers.generic import GenericCsvParser, StubBankParser


class ParserRegistry:
    def __init__(self) -> None:
        self._parsers: dict[str, BankStatementParser] = {
            "generic": GenericCsvParser(),
            "tinkoff": StubBankParser("tinkoff", "Тинькофф"),
            "sber": StubBankParser("sber", "Сбербанк"),
            "alfa": StubBankParser("alfa", "Альфа-Банк"),
            "yandex": StubBankParser("yandex", "Яндекс Pay"),
            "ozon": StubBankParser("ozon", "Ozon Банк"),
        }

    def get(self, bank: str) -> BankStatementParser:
        return self._parsers.get(bank, self._parsers["generic"])

    def parse(self, bank: str, content: bytes, filename: str) -> tuple[list, str | None]:
        parser = self.get(bank)
        try:
            rows = parser.parse(content, filename)
            return rows, None
        except ParserNotReadyError as exc:
            if bank == "generic":
                raise
            fallback = self._parsers["generic"]
            rows = fallback.parse(content, filename)
            return rows, str(exc)


parser_registry = ParserRegistry()
