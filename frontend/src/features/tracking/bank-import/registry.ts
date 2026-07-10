import { detectBank } from "@/features/tracking/bank-import/detect-bank";
import { parseAlfaStatement } from "@/features/tracking/bank-import/parsers/alfa";
import { parseOzonStatement } from "@/features/tracking/bank-import/parsers/ozon";
import { parseSberStatement } from "@/features/tracking/bank-import/parsers/sber";
import { parseTinkoffStatement } from "@/features/tracking/bank-import/parsers/tinkoff";
import { parseYandexStatement } from "@/features/tracking/bank-import/parsers/yandex";
import { detectInternalTransfers } from "@/features/tracking/bank-import/transfer-detector";
import type { BankId, ParsedBankTransaction } from "@/features/tracking/bank-import/types";

type ParserFn = (text: string) => ParsedBankTransaction[];

const PARSERS: Record<BankId, ParserFn> = {
  sber: parseSberStatement,
  tinkoff: parseTinkoffStatement,
  alfa: parseAlfaStatement,
  ozon: parseOzonStatement,
  yandex: parseYandexStatement,
};

export function parseBankStatement(text: string, bank: BankId): ParsedBankTransaction[] {
  const parser = PARSERS[bank];
  const rows = parser(text);
  return detectInternalTransfers(rows);
}

export function parseBankStatementWithDetection(text: string, filename: string, bank?: BankId | null) {
  const detection = detectBank(text, filename);
  const resolvedBank = bank ?? detection.bank;
  if (!resolvedBank) {
    throw new Error("Не удалось определить банк. Выберите банк вручную.");
  }

  return {
    bank: resolvedBank,
    detection,
    transactions: parseBankStatement(text, resolvedBank),
  };
}

export { detectBank };
