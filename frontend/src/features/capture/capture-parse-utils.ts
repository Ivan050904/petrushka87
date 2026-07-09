import type { RecognizedToken } from "@/features/capture/task-draft-parser";

export function parseDecimal(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseAmount(value: string) {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function stripCaptureMarkers(text: string) {
  return text
    .replace(/(?:^|[\s#])#?(?:задача|task|фин|финансы|finance|деньги|еда|food|питание|заметка|note)(?=$|[\s,.:;)\]])/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanParsedText(source: string, tokens: RecognizedToken[]) {
  let cleaned = "";
  let cursor = 0;
  const sorted = compactTokens(tokens);
  sorted.forEach((token) => {
    cleaned += source.slice(cursor, token.start);
    cursor = token.end;
  });
  cleaned += source.slice(cursor);
  return cleaned
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:])/g, "$1")
    .replace(/^[,.:;–—-]+|[,.:;–—-]+$/g, "")
    .trim();
}

export function addToken(
  tokens: RecognizedToken[],
  match: RegExpMatchArray,
  kind: RecognizedToken["kind"],
  label: string,
) {
  const rawText = match[0] ?? "";
  const rawStart = match.index ?? 0;
  const leadingOffset = rawText.length - rawText.trimStart().length;
  const trailingOffset = rawText.length - rawText.trimEnd().length;
  const start = rawStart + leadingOffset;
  const end = rawStart + rawText.length - trailingOffset;
  const text = rawText.slice(leadingOffset, rawText.length - trailingOffset);
  if (!text || tokens.some((token) => rangesOverlap(start, end, token.start, token.end))) {
    return false;
  }
  tokens.push({ kind, text, label, start, end });
  return true;
}

export function compactTokens(tokens: RecognizedToken[]) {
  return tokens
    .slice()
    .sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start))
    .filter(
      (token, index, list) =>
        !list.slice(0, index).some((item) => rangesOverlap(token.start, token.end, item.start, item.end)),
    )
    .sort((left, right) => left.start - right.start);
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && rightStart < leftEnd;
}
