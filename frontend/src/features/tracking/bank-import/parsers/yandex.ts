import { buildImportIdSync } from "@/features/tracking/bank-import/dedup";
import {
  cleanPdfLines,
  isDateLine,
  parseAmountToken,
  parseRussianDate,
  suggestTitleFromDescription,
} from "@/features/tracking/bank-import/normalize";
import { enrichTransaction } from "@/features/tracking/bank-import/transfer-detector";
import type { ParsedBankTransaction } from "@/features/tracking/bank-import/types";

const AMOUNT_WITH_RUBLE = /^[+\-−–]?\s*\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?\s*₽$/;
const CARD_MASK = /^\*\d{4}$/;

export function parseYandexStatement(text: string): ParsedBankTransaction[] {
  const sections = splitYandexSections(text);
  const rows: ParsedBankTransaction[] = [];

  for (const section of sections) {
    rows.push(...parseYandexSection(section));
  }

  return rows;
}

function splitYandexSections(text: string): string[] {
  const lines = cleanPdfLines(text);
  const sections: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^Выписка по Договору за период/i.test(line)) {
      if (current.length > 0) {
        sections.push(current);
      }
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    sections.push(current);
  }

  return sections.map((section) => section.join("\n"));
}

function parseYandexSection(text: string): ParsedBankTransaction[] {
  const lines = cleanPdfLines(text);
  const rows: ParsedBankTransaction[] = [];
  let index = 0;

  while (index < lines.length) {
    const descriptionParts: string[] = [];

    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (isDateLine(current)) {
        break;
      }
      if (/^Описание операции$|^Дата и время$|^Входящий остаток$|^Исходящий остаток$/i.test(current)) {
        index += 1;
        continue;
      }
      descriptionParts.push(current);
      index += 1;
    }

    if (!isDateLine(lines[index] ?? "")) {
      break;
    }

    const operationDate = parseRussianDate(lines[index] ?? "");
    index += 1;
    const timeLine = lines[index] ?? "";
    if (/^в\s+\d{2}:\d{2}$/i.test(timeLine)) {
      index += 1;
    }

    if (!isDateLine(lines[index] ?? "")) {
      continue;
    }
    index += 1;

    if (CARD_MASK.test(lines[index] ?? "")) {
      index += 1;
    }

    const amountLine = lines[index] ?? "";
    if (!AMOUNT_WITH_RUBLE.test(amountLine)) {
      continue;
    }
    const parsedAmount = parseAmountToken(amountLine);
    index += 1;
    if (lines[index] && AMOUNT_WITH_RUBLE.test(lines[index])) {
      index += 1;
    }
    if (!parsedAmount || !operationDate) {
      continue;
    }

    const rawDescription = descriptionParts.join(" ").replace(/\s+/g, " ").trim();
    if (!rawDescription || /^Выписка по Договору/i.test(rawDescription)) {
      continue;
    }

    const title = suggestTitleFromDescription(rawDescription, "yandex");
    rows.push(
      enrichTransaction({
        date: operationDate,
        amount: parsedAmount.amount,
        direction: parsedAmount.direction,
        currency: "RUB",
        title,
        description: rawDescription,
        rawDescription,
        bank: "yandex",
        importId: buildImportIdSync(["yandex", operationDate, String(parsedAmount.amount), rawDescription]),
      }),
    );
  }

  return rows;
}
