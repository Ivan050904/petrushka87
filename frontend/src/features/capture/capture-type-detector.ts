import type { QuickCaptureEntryType, QuickEntryType } from "@/features/capture/capture-entry-types";
import { parseFinanceLine, scoreFinanceDraft } from "@/features/capture/finance-draft-parser";
import { parseFoodLine, scoreFoodDraft } from "@/features/capture/food-draft-parser";
import { parseQuickTasks } from "@/features/capture/task-draft-parser";

const EXPLICIT_TYPE_MARKERS: Array<{ pattern: RegExp; type: QuickCaptureEntryType }> = [
  { pattern: /(?:^|[\s#])#?(?:задача|task)(?:$|[\s,.:;)\]])/giu, type: "task" },
  { pattern: /(?:^|[\s#])#?(?:фин|финансы|finance|деньги)(?:$|[\s,.:;)\]])/giu, type: "finance" },
  { pattern: /(?:^|[\s#])#?(?:еда|food|питание)(?:$|[\s,.:;)\]])/giu, type: "food" },
  { pattern: /(?:^|[\s#])#?(?:заметка|note)(?:$|[\s,.:;)\]])/giu, type: "note" },
];

const TASK_ACTION_VERBS =
  /^(?:купить|позвонить|написать|отправить|сделать|проверить|заказать|записаться|сходить|встретиться|подготовить|собрать|найти|узнать|уточнить|напомнить|созвониться|связаться|доделать|закончить|начать|пройти|сдать|забрать|забронировать)(?:\s|$|[,.:;])/iu;

const TASK_TIME_HINT =
  /(?:^|[\s,.(])(?:завтра|послезавтра|сегодня|через\s+\d+|в\s+\d{1,2}(?:[:.]\d{2})?|до\s+\d{1,2}(?:[:.]\d{2})?|\d{1,2}[./]\d{1,2}|\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря))/iu;

function detectExplicitType(content: string): QuickCaptureEntryType | null {
  for (const marker of EXPLICIT_TYPE_MARKERS) {
    marker.pattern.lastIndex = 0;
    if (marker.pattern.test(content)) {
      return marker.type;
    }
  }
  return null;
}
function normalizeTaskLine(line: string) {
  return line.trim().replace(/^[-*•\d]+[\).]\s*/, "");
}

function scoreTaskContent(content: string) {
  const drafts = parseQuickTasks(content);
  if (drafts.length === 0) {
    return 0;
  }

  const recognizedCount = drafts.reduce((total, draft) => total + draft.recognizedTokens.length, 0);
  let score = 0;

  if (recognizedCount > 0) {
    score = Math.min(6, recognizedCount * 2 + (drafts.length > 1 ? 1 : 0));
  } else if (drafts.length > 1) {
    score = 2;
  }

  const firstLine = normalizeTaskLine(content.split(/\n+/)[0] ?? content);
  if (TASK_ACTION_VERBS.test(firstLine)) {
    score += 2;
  }
  if (TASK_TIME_HINT.test(content)) {
    score += 2;
  }
  if (/^[-*•\d]+[\).]/u.test(content.split(/\n+/)[0]?.trim() ?? "")) {
    score += 1;
  }

  return Math.min(7, score);
}

export function detectCaptureType(content: string): QuickCaptureEntryType {
  const trimmed = content.trim();
  if (!trimmed) {
    return "note";
  }

  const explicit = detectExplicitType(trimmed);
  if (explicit) {
    return explicit;
  }

  const financeScore = scoreFinanceDraft(parseFinanceLine(trimmed));
  const foodScore = scoreFoodDraft(parseFoodLine(trimmed));
  const taskScore = scoreTaskContent(trimmed);

  const ranked = [
    { type: "finance" as const, score: financeScore },
    { type: "food" as const, score: foodScore },
    { type: "task" as const, score: taskScore },
  ].sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.score <= 0) {
    return "note";
  }

  if (best.type === "finance" && financeScore >= 5 && financeScore >= taskScore) {
    return "finance";
  }
  if (best.type === "food" && foodScore >= 3 && foodScore >= taskScore) {
    return "food";
  }
  if (best.type === "task" && taskScore >= 2 && taskScore >= financeScore) {
    return "task";
  }

  if (financeScore >= 5 && financeScore > taskScore && financeScore > foodScore) {
    return "finance";
  }
  if (foodScore >= 3 && foodScore > taskScore && foodScore > financeScore) {
    return "food";
  }
  if (taskScore >= 2 && taskScore >= financeScore && taskScore >= foodScore) {
    return "task";
  }

  return "note";
}

export function resolveCaptureType(quickType: QuickEntryType, content: string): QuickCaptureEntryType {
  if (quickType !== "auto") {
    return quickType;
  }
  return detectCaptureType(content);
}
