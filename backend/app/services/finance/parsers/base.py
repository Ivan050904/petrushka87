from __future__ import annotations

from abc import ABC, abstractmethod

from app.services.finance.models import ParsedTransaction


class ParserNotReadyError(Exception):
    def __init__(self, bank: str, message: str) -> None:
        self.bank = bank
        super().__init__(message)


class BankStatementParser(ABC):
    bank: str
    ready: bool = False

    @abstractmethod
    def parse(self, content: bytes, filename: str) -> list[ParsedTransaction]:
        raise NotImplementedError
