import {
  addToken,
  cleanParsedText,
  compactTokens,
  parseAmount,
  stripCaptureMarkers,
} from "@/features/capture/capture-parse-utils";
import type { RecognizedToken } from "@/features/capture/task-draft-parser";

export type FinanceDirection = "income" | "expense";

export type FinanceDraft = {
  amount: number;
  direction: FinanceDirection;
  currency: string;
  description: string;
  title: string;
  sourceText: string;
  recognizedTokens: RecognizedToken[];
};

const INCOME_HINT =
  /(?:^|[\s,.:;(\[])(?:доход|получ(?:ил|ила|или|ено|ение)?|зарплат(?:а|у|ы)|премия|возврат|cashback|income|refund)(?:$|[\s,.:;)\]])/giu;
const EXPENSE_HINT =
  /(?:^|[\s,.:;(\[])(?:-|расход|трат(?:а|ы|ил|ила|или)?|потрат(?:ил|ила|или)|купил(?:\s|[а-я]{2}\s)|заплатил(?:\s|[а-я]{2}\s)?|оплатил(?:\s|[а-я]{2}\s)?|перев(?:ёл|ел|од)|expense|spent)(?:$|[\s,.:;)\]])/giu;

const CURRENCY_SUFFIX = String.raw`(?:₽|руб\.?|rub|[рr]\.?(?![\p{L}\p{N}_])|[$€£]|\b(?:usd|eur|gbp)\b)`;
const AMOUNT_WITH_CURRENCY =
  new RegExp(String.raw`(?<![\d.])([+−-]?)(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*${CURRENCY_SUFFIX}`, "giu");
const CURRENCY_PREFIX_AMOUNT =
  /(₽|[$€£])\s*(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/giu;
const SIGNED_LEADING_AMOUNT =
  /^([+−-])(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![:\d.])/u;
const AMOUNT_ONLY = /(?<![\d.])([+−-])(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![:\d.])/giu;
const LEADING_AMOUNT = /^(?:расход|доход|income|expense)\s+(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/giu;
const TRAILING_AMOUNT =
  new RegExp(String.raw`[—–-]\s*(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*${CURRENCY_SUFFIX}?\s*$`, "giu");
const END_AMOUNT =
  new RegExp(String.raw`(?<![\d.])(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*${CURRENCY_SUFFIX}\s*$`, "giu");
const FOR_AMOUNT =
  new RegExp(String.raw`(?<![\p{L}\p{N}_])(?:за|на)\s+(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*${CURRENCY_SUFFIX}?`, "giu");
const PLAIN_AMOUNT =
  /(?<![\d.])(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![:\d.])/u;
const SHORT_SCALE_AMOUNT =
  /(?<![\d.])([+−-]?)(\d+(?:[.,]\d+)?)\s*(?:k\b|к\b|тыс(?:\.|яч)?|тысяч(?:и)?)/giu;

export function parseFinanceLine(line: string): FinanceDraft {
  const sourceText = stripCaptureMarkers(line.trim());
  const tokens: RecognizedToken[] = [];
  let amount = 0;
  let direction: FinanceDirection = "expense";
  let currency = "RUB";
  let hasAmount = false;

  for (const match of sourceText.matchAll(INCOME_HINT)) {
    addToken(tokens, match, "status", "доход");
    direction = "income";
  }
  for (const match of sourceText.matchAll(EXPENSE_HINT)) {
    addToken(tokens, match, "status", "расход");
    direction = "expense";
  }

  const assignAmount = (
    match: RegExpMatchArray,
    rawAmount: string,
    sign?: string,
    currencyToken?: string,
  ) => {
    const start = match.index ?? 0;
    const end = start + (match[0]?.length ?? 0);
    if (!tokens.some((token) => token.start < end && start < token.end)) {
      tokens.push({
        kind: "priority",
        text: match[0]?.trim() || rawAmount,
        label: "сумма",
        start,
        end,
      });
    }
    amount = parseScaledAmount(rawAmount);
    if (currencyToken) {
      currency = currencyFromToken(currencyToken);
    }
    if (sign === "+") {
      direction = "income";
    } else if (sign === "-" || sign === "−") {
      direction = "expense";
    }
    hasAmount = amount > 0;
  };

  const signedLeading = sourceText.match(SIGNED_LEADING_AMOUNT);
  if (signedLeading) {
    assignAmount(signedLeading, signedLeading[2], signedLeading[1]);
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(AMOUNT_WITH_CURRENCY)) {
      assignAmount(match, match[2], match[1], match[3]);
      break;
    }
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(CURRENCY_PREFIX_AMOUNT)) {
      assignAmount(match, match[2], undefined, match[1]);
      break;
    }
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(SHORT_SCALE_AMOUNT)) {
      assignAmount(match, match[2], match[1]);
      amount *= 1000;
      hasAmount = amount > 0;
      break;
    }
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(AMOUNT_ONLY)) {
      assignAmount(match, match[2], match[1]);
      break;
    }
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(LEADING_AMOUNT)) {
      assignAmount(match, match[1]);
      break;
    }
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(TRAILING_AMOUNT)) {
      assignAmount(match, match[1], undefined, match[2]);
      break;
    }
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(FOR_AMOUNT)) {
      assignAmount(match, match[1], undefined, match[2]);
      break;
    }
  }

  if (!hasAmount) {
    for (const match of sourceText.matchAll(END_AMOUNT)) {
      assignAmount(match, match[1], undefined, match[2]);
      break;
    }
  }

  if (!hasAmount) {
    const plainAmount = sourceText.match(PLAIN_AMOUNT);
    if (plainAmount) {
      assignAmount(plainAmount, plainAmount[1]);
    }
  }

  let description = cleanParsedText(sourceText, compactTokens(tokens));
  if (amount > 0) {
    description = stripParsedAmount(description || sourceText, amount);
  }
  if (!description) {
    description = sourceText;
  }

  return {
    amount,
    direction,
    currency,
    description,
    title: description || sourceText,
    sourceText,
    recognizedTokens: compactTokens(tokens),
  };
}

export function scoreFinanceDraft(draft: FinanceDraft) {
  let score = 0;
  if (draft.amount > 0) {
    score += 3;
  }
  const hasFinanceContext =
    draft.recognizedTokens.some((token) => token.kind === "status") ||
    /(?:₽|руб|[рr](?![\p{L}\p{N}_])|[$€£]|\b(?:usd|eur|gbp)\b)/iu.test(draft.sourceText) ||
    /(?<![\p{L}\p{N}_])(?:за|на)\s+\d/u.test(draft.sourceText) ||
    /(?:^|[\s,.:;(])[+−-]\d/u.test(draft.sourceText);
  if (draft.amount > 0 && hasFinanceContext) {
    score += 2;
  }
  if (draft.recognizedTokens.some((token) => token.kind === "status")) {
    score += 2;
  }
  if (/^(?:расход|доход|[+−-]?\d)/iu.test(draft.sourceText)) {
    score += 1;
  }
  if (/[—–-]\s*\d/u.test(draft.sourceText)) {
    score += 1;
  }
  if (draft.description.trim() && draft.amount > 0) {
    score += 1;
  }
  return score;
}

function stripParsedAmount(text: string, amount: number) {
  const amountPattern = String(amount).replace(".", "[.,]");
  return text
    .replace(new RegExp(String.raw`^\+\s*${amountPattern}(?:[.,]\d+)?\s*`, "u"), "")
    .replace(new RegExp(String.raw`^${amountPattern}(?:[.,]\d+)?\s*`, "u"), "")
    .replace(new RegExp(String.raw`\s+${amountPattern}(?:[.,]\d+)?\s*(?:₽|руб\.?|[рr])?\s*$`, "iu"), "")
    .trim();
}

function parseScaledAmount(value: string) {
  return parseAmount(value);
}

function currencyFromToken(token: string) {
  const normalized = token.trim().toLowerCase();
  if (normalized.startsWith("$") || normalized === "usd") {
    return "USD";
  }
  if (normalized.startsWith("€") || normalized === "eur") {
    return "EUR";
  }
  if (normalized.startsWith("£") || normalized === "gbp") {
    return "GBP";
  }
  if (normalized === "р" || normalized === "r") {
    return "RUB";
  }
  return "RUB";
}
