import { buildImportIdSync } from "@/features/tracking/bank-import/dedup";
import {
  cleanPdfLines,
  parseAmountToken,
  parseRussianDateTime,
  skipUntilTransactions,
  suggestTitleFromDescription,
} from "@/features/tracking/bank-import/normalize";
import { enrichTransaction } from "@/features/tracking/bank-import/transfer-detector";
import type { ParsedBankTransaction } from "@/features/tracking/bank-import/types";

const DATETIME_LINE = /^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}$/;
const DOC_NUMBER = /^\d{6,}$/;

export function parseOzonStatement(text: string): ParsedBankTransaction[] {
  const lines = skipUntilTransactions(cleanPdfLines(text), /Дата операции/i);
  const rows: ParsedBankTransaction[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!DATETIME_LINE.test(line)) {
      index += 1;
      continue;
    }

    const operationDate = parseRussianDateTime(line);
    if (!operationDate) {
      index += 1;
      continue;
    }

    index += 1;
    const doc = lines[index] ?? "";
    if (!DOC_NUMBER.test(doc)) {
      continue;
    }
    index += 1;

    const descriptionParts: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (DATETIME_LINE.test(current)) {
        break;
      }
      if (/^[+\-−–]\s*\d/.test(current)) {
        break;
      }
      if (/^(Российские рубли|Валюта|\d+)$/i.test(current)) {
        index += 1;
        continue;
      }
      descriptionParts.push(current);
      index += 1;
    }

    const amountLine = lines[index] ?? "";
    const parsedAmount = parseAmountToken(amountLine);
    index += 1;
    if (lines[index] && /^[+\-−–]\s*\d/.test(lines[index])) {
      index += 1;
    }
    if (!parsedAmount) {
      continue;
    }

    const rawDescription = descriptionParts.join(" ").replace(/\s+/g, " ").trim();
    const title = suggestTitleFromDescription(rawDescription, "ozon");

    rows.push(
      enrichTransaction({
        date: operationDate,
        amount: parsedAmount.amount,
        direction: parsedAmount.direction,
        currency: "RUB",
        title,
        description: rawDescription,
        rawDescription: `${doc} ${rawDescription}`,
        bank: "ozon",
        externalRef: doc,
        importId: buildImportIdSync(["ozon", operationDate, String(parsedAmount.amount), rawDescription]),
      }),
    );
  }

  return rows;
}
