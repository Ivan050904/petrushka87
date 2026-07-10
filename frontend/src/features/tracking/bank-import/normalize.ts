const DATE_LINE = /^\d{2}\.\d{2}\.\d{4}$/;
const TIME_LINE = /^\d{2}:\d{2}$/;
const AMOUNT_LINE =
  /^([+−\-–]?\s*\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?)\s*(?:RUR|₽|руб\.?)?$/i;
const SIGNED_AMOUNT_WITH_CURRENCY =
  /^([+−\-–]?)\s*(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?)\s*(?:RUR|₽|руб\.?)$/i;
const PAGE_MARKER = /^--- PAGE \d+ ---$/;
const HEADER_NOISE =
  /^(Страница \d+ из \d+|Продолжение на следующей странице|Дата проводки|Код операции|Описание|Сумма|в валюте счета|Т\.Т\.|Уполномоченное лицо|\(подпись|\(Ф\.И\.О\.)/i;

export function cleanPdfLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !PAGE_MARKER.test(line));
}

export function parseAmountToken(raw: string): { amount: number; direction: "income" | "expense" } | null {
  const normalized = raw.replace(/\u00A0/g, " ").trim();
  const match = normalized.match(SIGNED_AMOUNT_WITH_CURRENCY) ?? normalized.match(AMOUNT_LINE);
  if (!match) {
    return null;
  }

  const sign = (match[1] ?? "").trim();
  const numeric = (match[2] ?? match[1] ?? "").replace(/\s/g, "").replace(",", ".");
  const amount = Number(numeric);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const isIncome = sign === "+" || (sign === "" && normalized.startsWith("+"));
  const isExpense = sign === "-" || sign === "−" || sign === "–" || (!isIncome && /^[-−–]/.test(normalized));
  return {
    amount,
    direction: isIncome && !isExpense ? "income" : "expense",
  };
}

export function parseRussianDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function parseRussianDateTime(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function normalizeCurrency(value: string | undefined): string {
  const token = (value ?? "RUB").trim().toUpperCase();
  if (token === "RUR" || token === "₽" || token.includes("РУБ")) {
    return "RUB";
  }
  return token.replace(/[^A-Z]/g, "").slice(0, 3) || "RUB";
}

export function extractMerchantFromAlfa(description: string): string | null {
  const mccMatch = description.match(/\\([^\\]+)\s+MCC\d+/i) ?? description.match(/([A-Z0-9][A-Z0-9 .\-]+)\s+MCC\d+/i);
  return mccMatch?.[1]?.trim() ?? null;
}

export function suggestTitleFromDescription(description: string, bank: string): string {
  const trimmed = description.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "Операция";
  }

  if (bank === "alfa") {
    const merchant = extractMerchantFromAlfa(trimmed);
    if (merchant) {
      return merchant;
    }
  }

  if (bank === "sber") {
    const withoutCard = trimmed.split(". Операция по карте")[0]?.trim();
    if (withoutCard) {
      return withoutCard.slice(0, 80);
    }
  }

  const firstLine = trimmed.split(/[.!?\n]/)[0]?.trim();
  return (firstLine || trimmed).slice(0, 80);
}

export function isDateLine(line: string) {
  return DATE_LINE.test(line);
}

export function isTimeLine(line: string) {
  return TIME_LINE.test(line);
}

export function isHeaderNoise(line: string) {
  return HEADER_NOISE.test(line);
}

export function skipUntilTransactions(lines: string[], marker: RegExp): string[] {
  const index = lines.findIndex((line) => marker.test(line));
  if (index === -1) {
    return lines;
  }
  return lines.slice(index + 1);
}
