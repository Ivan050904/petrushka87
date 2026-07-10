import { buildImportIdSync } from "@/features/tracking/bank-import/dedup";
import {
  cleanPdfLines,
  isDateLine,
  isTimeLine,
  parseAmountToken,
  parseRussianDate,
  skipUntilTransactions,
  suggestTitleFromDescription,
} from "@/features/tracking/bank-import/normalize";
import { enrichTransaction } from "@/features/tracking/bank-import/transfer-detector";
import type { ParsedBankTransaction } from "@/features/tracking/bank-import/types";

const CARD_SUFFIX = /^\d{4}$/;
const AMOUNT_WITH_RUBLE = /^[+\-−–]?\s*\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?\s*₽$/;

export function parseTinkoffStatement(text: string): ParsedBankTransaction[] {
  const lines = skipUntilTransactions(cleanPdfLines(text), /Движение средств за период/i);
  const rows: ParsedBankTransaction[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!isDateLine(line)) {
      index += 1;
      continue;
    }

    const operationDate = parseRussianDate(line);
    if (!operationDate) {
      index += 1;
      continue;
    }

    index += 1;
    if (!isTimeLine(lines[index] ?? "")) {
      continue;
    }
    index += 1;

    if (!isDateLine(lines[index] ?? "")) {
      continue;
    }
    index += 1;
    if (!isTimeLine(lines[index] ?? "")) {
      continue;
    }
    index += 1;

    const amountLine = lines[index] ?? "";
    if (!AMOUNT_WITH_RUBLE.test(amountLine)) {
      continue;
    }
    const parsedAmount = parseAmountToken(amountLine);
    index += 1;
    if (lines[index] && AMOUNT_WITH_RUBLE.test(lines[index])) {
      index += 1;
    }
    if (!parsedAmount) {
      continue;
    }

    const descriptionParts: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (isDateLine(current) && isTimeLine(lines[index + 1] ?? "")) {
        break;
      }
      if (CARD_SUFFIX.test(current)) {
        index += 1;
        break;
      }
      if (/^АО «ТБанк»|^Дата и время|^Описание|^Номер$/i.test(current)) {
        index += 1;
        continue;
      }
      descriptionParts.push(current);
      index += 1;
    }

    const rawDescription = descriptionParts.join(" ").replace(/\s+/g, " ").trim();
    const title = suggestTitleFromDescription(rawDescription, "tinkoff");

    rows.push(
      enrichTransaction({
        date: operationDate,
        amount: parsedAmount.amount,
        direction: parsedAmount.direction,
        currency: "RUB",
        title,
        description: rawDescription,
        rawDescription,
        bank: "tinkoff",
        importId: buildImportIdSync(["tinkoff", operationDate, String(parsedAmount.amount), rawDescription]),
      }),
    );
  }

  return rows;
}
