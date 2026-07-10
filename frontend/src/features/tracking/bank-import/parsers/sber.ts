import { buildImportIdSync } from "@/features/tracking/bank-import/dedup";
import {
  cleanPdfLines,
  isDateLine,
  isHeaderNoise,
  isTimeLine,
  parseAmountToken,
  parseRussianDate,
  skipUntilTransactions,
  suggestTitleFromDescription,
} from "@/features/tracking/bank-import/normalize";
import { enrichTransaction } from "@/features/tracking/bank-import/transfer-detector";
import type { ParsedBankTransaction } from "@/features/tracking/bank-import/types";

const AUTH_CODE = /^\d{6}$/;
const AMOUNT_WITH_BALANCE = /^([+−\-–]?\s*\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?)$/;
const COMMISSION_LINE = /^В сумму операции включена комиссия/i;

export function parseSberStatement(text: string): ParsedBankTransaction[] {
  const lines = skipUntilTransactions(cleanPdfLines(text), /Расшифровка операций/i);
  const rows: ParsedBankTransaction[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line || !isDateLine(line) || isHeaderNoise(line)) {
      index += 1;
      continue;
    }

    const operationDate = parseRussianDate(line);
    if (!operationDate) {
      index += 1;
      continue;
    }

    index += 1;
    const next = lines[index] ?? "";
    let time = "";
    let bankCategory = "";
    let amountLine = "";
    let processingDate = "";
    let authCode = "";
    const descriptionParts: string[] = [];

    if (isTimeLine(next)) {
      time = next;
      index += 1;
      bankCategory = lines[index] ?? "";
      index += 1;
      amountLine = lines[index] ?? "";
      index += 1;
      const balanceLine = lines[index] ?? "";
      if (AMOUNT_WITH_BALANCE.test(balanceLine) && isDateLine(lines[index + 1] ?? "")) {
        index += 1;
      }
      processingDate = lines[index] ?? "";
      index += 1;
      if (AUTH_CODE.test(lines[index] ?? "")) {
        authCode = lines[index] ?? "";
        index += 1;
      }
    } else if (AUTH_CODE.test(next)) {
      authCode = next;
      index += 1;
      amountLine = lines[index] ?? "";
      index += 1;
    } else {
      index += 1;
      continue;
    }

    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (isDateLine(current)) {
        break;
      }
      if (COMMISSION_LINE.test(current)) {
        index += 1;
        continue;
      }
      if (/^Выписка по счёту|^Страница \d+/i.test(current)) {
        index += 1;
        continue;
      }
      descriptionParts.push(current);
      index += 1;
    }

    const parsedAmount = parseAmountToken(amountLine.replace(/\u00A0/g, " "));
    if (!parsedAmount) {
      continue;
    }

    const rawDescription = descriptionParts.join(" ").trim();
    const description = [bankCategory, rawDescription].filter(Boolean).join(". ");
    const title = suggestTitleFromDescription(rawDescription || bankCategory, "sber");

    rows.push(
      enrichTransaction({
        date: operationDate,
        amount: parsedAmount.amount,
        direction: parsedAmount.direction,
        currency: "RUB",
        title,
        description,
        rawDescription: [operationDate, time, bankCategory, amountLine, processingDate, authCode, rawDescription]
          .filter(Boolean)
          .join(" "),
        bank: "sber",
        bankCategory: bankCategory || null,
        externalRef: authCode || undefined,
        importId: buildImportIdSync(["sber", operationDate, String(parsedAmount.amount), rawDescription]),
      }),
    );
  }

  return rows;
}
