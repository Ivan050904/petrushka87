import { buildImportIdSync } from "@/features/tracking/bank-import/dedup";
import {
  cleanPdfLines,
  extractMerchantFromAlfa,
  isDateLine,
  isHeaderNoise,
  parseAmountToken,
  parseRussianDate,
  skipUntilTransactions,
  suggestTitleFromDescription,
} from "@/features/tracking/bank-import/normalize";
import { enrichTransaction } from "@/features/tracking/bank-import/transfer-detector";
import type { ParsedBankTransaction } from "@/features/tracking/bank-import/types";

const OPERATION_CODE = /^(?:CRD_[A-Z0-9]+|C\d+)$/;

export function parseAlfaStatement(text: string): ParsedBankTransaction[] {
  const lines = skipUntilTransactions(cleanPdfLines(text), /Операции по счету/i);
  const rows: ParsedBankTransaction[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line || !isDateLine(line) || isHeaderNoise(line)) {
      index += 1;
      continue;
    }

    const postingDate = parseRussianDate(line);
    if (!postingDate) {
      index += 1;
      continue;
    }

    index += 1;
    const code = lines[index] ?? "";
    if (!OPERATION_CODE.test(code)) {
      continue;
    }
    index += 1;

    const descriptionParts: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (isDateLine(current) && OPERATION_CODE.test(lines[index + 1] ?? "")) {
        break;
      }
      if (SIGNED_AMOUNT.test(current)) {
        break;
      }
      if (isHeaderNoise(current)) {
        index += 1;
        continue;
      }
      descriptionParts.push(current);
      index += 1;
    }

    const amountLine = lines[index] ?? "";
    const parsedAmount = parseAmountToken(amountLine);
    index += 1;
    if (!parsedAmount) {
      continue;
    }

    const rawDescription = descriptionParts.join(" ").replace(/\s+/g, " ").trim();
    const operationDateMatch = rawDescription.match(/дата совершения операции:\s*(\d{2}\.\d{2}\.\d{2,4})/i);
    const operationDate = operationDateMatch
      ? parseShortRussianDate(operationDateMatch[1] ?? postingDate)
      : postingDate;
    const merchant = extractMerchantFromAlfa(rawDescription);
    const title = merchant ?? suggestTitleFromDescription(rawDescription, "alfa");

    rows.push(
      enrichTransaction({
        date: operationDate,
        amount: parsedAmount.amount,
        direction: parsedAmount.direction,
        currency: "RUB",
        title,
        description: rawDescription,
        rawDescription: `${code} ${rawDescription}`,
        bank: "alfa",
        externalRef: code,
        importId: buildImportIdSync(["alfa", operationDate, String(parsedAmount.amount), rawDescription]),
      }),
    );
  }

  return rows;
}

const SIGNED_AMOUNT = /^[+\-−–]?\s*\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?\s*RUR$/i;

function parseShortRussianDate(value: string): string {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (!match) {
    return value;
  }
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
}
