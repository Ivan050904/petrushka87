import type { ParsedTaskCandidate } from "@/lib/api";

const captureTaskStatuses = ["inbox", "active", "done", "cancelled"] as const;
type CaptureTaskStatus = (typeof captureTaskStatuses)[number];

const captureTaskPriorities = ["low", "medium", "high", "urgent"] as const;
type CaptureTaskPriority = (typeof captureTaskPriorities)[number];

export type RecognizedTokenKind =
  | "date"
  | "time"
  | "priority"
  | "tag"
  | "assignee"
  | "duration"
  | "reminder"
  | "recurrence"
  | "status";

export type RecognizedToken = {
  kind: RecognizedTokenKind;
  text: string;
  label: string;
  start: number;
  end: number;
};

export type CaptureTaskDraft = {
  title: string;
  description: string;
  sourceText: string;
  status: CaptureTaskStatus;
  priority: CaptureTaskPriority;
  scheduledAt: string;
  deadline: string;
  plannedDurationMinutes: string;
  actualDurationMinutes: string;
  reminderAt: string;
  reminderText: string;
  recurrence: string;
  tags: string;
  assigneeName: string;
  recognizedTokens: RecognizedToken[];
};

export type QuickTaskDraft = CaptureTaskDraft;

function normalizeStatus(value: unknown): CaptureTaskStatus {
  return captureTaskStatuses.includes(value as CaptureTaskStatus)
    ? (value as CaptureTaskStatus)
    : "inbox";
}

function normalizePriority(value: unknown): CaptureTaskPriority {
  return captureTaskPriorities.includes(value as CaptureTaskPriority)
    ? (value as CaptureTaskPriority)
    : "medium";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function toDateTimeInputValue(value: string) {
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T09:00`;
  }
  const localDateTime = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (localDateTime) {
    return localDateTime[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

export function parseQuickTasks(input: string): CaptureTaskDraft[] {
  return splitTaskLines(input).map(parseQuickTaskLine);
}

function splitTaskLines(input: string) {
  return input
    .replace(/\r/g, "\n")
    .replace(/(?:^|\s)(\d+[\).])\s+/g, "\n")
    .split(/\n|;|\u2022/)
    .map((line) => line.replace(/^\s*[-*•]+|\s*\[[ xX]\]\s*/g, "").trim())
    .filter(Boolean);
}

export function parseQuickTaskLine(line: string): CaptureTaskDraft {
  const tokens: RecognizedToken[] = [];
  const tags: string[] = [];
  let assigneeName = "";
  let status: CaptureTaskStatus = "inbox";
  let priority: CaptureTaskPriority = "medium";
  let scheduledAt = "";
  let deadline = "";
  let plannedDurationMinutes = "";
  let reminderAt = "";
  let reminderText = "";
  let recurrence = "";
  let firstDateField: "scheduledAt" | "deadline" | null = null;
  let reminderOffsetMinutes: number | null = null;

  for (const match of line.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    addRecognizedToken(tokens, match, "tag", "тег");
    tags.push(match[1]);
  }

  for (const match of line.matchAll(/@([\p{L}\p{N}_.-]+)/gu)) {
    addRecognizedToken(tokens, match, "assignee", "исполнитель");
    assigneeName ||= match[1];
  }

  applyPriorityRules(line, tokens, (nextPriority) => {
    priority = strongerPriority(priority, nextPriority);
  });
  applyStatusRules(line, tokens, (nextStatus) => {
    status = nextStatus;
  });

  for (const match of line.matchAll(/(?<![\p{L}\p{N}_])(?:кажд(?:ый|ую|ое|ые)\s+(?:день|недел[юи]|месяц|год|понедельник|вторник|сред[ау]|четверг|пятниц[ау]|суббот[ау]|воскресенье)|ежедневно|еженедельно|ежемесячно)(?![\p{L}\p{N}_])/giu)) {
    addRecognizedToken(tokens, match, "recurrence", "повторение");
    recurrence ||= trimRecognizedText(match[0]);
  }

  for (const match of line.matchAll(/(?:(?<![\p{L}\p{N}_])на\s*)?(\d+)\s*(м|мин|минут(?:у|ы)?|ч|час(?:а|ов)?|h)(?![\p{L}\p{N}_])/giu)) {
    const beforeMatch = line.slice(Math.max(0, (match.index ?? 0) - 8), match.index ?? 0).toLowerCase();
    if (/(?:^|[^\p{L}\p{N}_])через\s*$/iu.test(beforeMatch)) {
      continue;
    }
    addRecognizedToken(tokens, match, "duration", "длительность");
    plannedDurationMinutes ||= durationToMinutes(match[1], match[2]);
  }

  for (const match of line.matchAll(/(?<![\p{L}\p{N}_])(?:напомни|напомнить|напоминание)(?![\p{L}\p{N}_])(?:\s+за\s+(?:(\d+)\s*)?(мин|м|час|ч|день|дня|дней)(?![\p{L}\p{N}_]))?/giu)) {
    addRecognizedToken(tokens, match, "reminder", "напоминание");
    reminderText ||= trimRecognizedText(match[0]);
    if (match[2]) {
      reminderOffsetMinutes = durationToMinuteNumber(match[1] || "1", match[2]);
    }
  }

  const assignDate = (
    match: RegExpMatchArray,
    date: string,
    prefix: string | undefined,
    explicitTime?: string,
  ) => {
    const field = dateFieldFromPrefix(prefix);
    const value = `${date}T${explicitTime || "09:00"}`;
    if (field === "scheduledAt") {
      scheduledAt ||= value;
    } else {
      deadline ||= value;
    }
    firstDateField ||= field;
    addRecognizedToken(tokens, match, "date", field === "scheduledAt" ? "когда выполнять" : "дедлайн");
  };

  for (const match of line.matchAll(/(?:(до|дедлайн|когда|начать|старт|с|к|на|в|во)(?:\s*[:\-]\s*|\s+))?(\d{4}-\d{2}-\d{2})(?:[T\s]([0-2]\d:[0-5]\d))?/giu)) {
    assignDate(match, match[2], match[1], match[3]);
  }

  for (const match of line.matchAll(/(?:(до|дедлайн|когда|начать|старт|с|к|на|в|во)(?:\s*[:\-]\s*|\s+))?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/giu)) {
    const date = parseNumericDate(match[2], match[3], match[4]);
    if (date) {
      assignDate(match, date, match[1]);
    }
  }

  for (const match of line.matchAll(/(?:(до|дедлайн|когда|начать|старт|с|к|на|в|во)(?:\s*[:\-]\s*|\s+))?(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?![\p{L}\p{N}_])/giu)) {
    const date = parseMonthNameDate(match[2], match[3]);
    if (date) {
      assignDate(match, date, match[1]);
    }
  }

  for (const match of line.matchAll(/(?:(до|дедлайн|когда|начать|старт|с|к|на)(?:\s*[:\-]\s*|\s+))?(?<![\p{L}\p{N}_])(послезавтра|завтра|сегодня)(?![\p{L}\p{N}_])/giu)) {
    assignDate(match, parseRelativeDate(match[2]), match[1]);
  }

  for (const match of line.matchAll(/(?:(до|дедлайн|когда|начать|старт|с|к|на|в|во)(?:\s*[:\-]\s*|\s+))?(?<![\p{L}\p{N}_])(пн|понедельник(?:а|у)?|вт|вторник(?:а|у)?|ср|среда|сред[ауы]|чт|четверг(?:а|у)?|пт|пятница|пятниц[ауы]|сб|суббот[ауы]|вс|воскресень(?:е|я|ю))(?![\p{L}\p{N}_])/giu)) {
    assignDate(match, parseWeekdayDate(match[2]), match[1]);
  }

  for (const match of line.matchAll(/(?:(до|дедлайн|когда|начать|старт|с|к|на)(?:\s*[:\-]\s*|\s+))?(?<![\p{L}\p{N}_])через\s+(\d+)\s*(м|мин|минут(?:у|ы)?|ч|час(?:а|ов)?|день|дня|дней)(?![\p{L}\p{N}_])/giu)) {
    const field = dateFieldFromPrefix(match[1]);
    const value = dateTimeFromNow(durationToMinuteNumber(match[2], match[3]));
    if (field === "scheduledAt") {
      scheduledAt ||= value;
    } else {
      deadline ||= value;
    }
    firstDateField ||= field;
    addRecognizedToken(tokens, match, "date", field === "scheduledAt" ? "когда выполнять" : "дедлайн");
  }

  for (const match of line.matchAll(/(?:(?<![\p{L}\p{N}_])в\s*)?([01]?\d|2[0-3])[:.](\d{2})(?![\p{L}\p{N}_])/gu)) {
    if (!addRecognizedToken(tokens, match, "time", "время")) {
      continue;
    }
    const field = dateFieldFromTimeContext(line, match.index, firstDateField);
    const time = `${padDatePart(Number(match[1]))}:${match[2]}`;
    if (field === "scheduledAt") {
      scheduledAt = withTime(baseDateForTime(field, scheduledAt, deadline), time);
    } else {
      deadline = withTime(baseDateForTime(field, scheduledAt, deadline), time);
    }
  }

  for (const match of line.matchAll(/(?<![\p{L}\p{N}_])(?:до|дедлайн|к)(?:\s*[:\-]\s*|\s+)([01]?\d|2[0-3])(?![:.\p{L}\p{N}_])/giu)) {
    if (!addRecognizedToken(tokens, match, "time", "дедлайн")) {
      continue;
    }
    deadline = withTime(baseDateForTime("deadline", scheduledAt, deadline), `${padDatePart(Number(match[1]))}:00`);
  }

  for (const match of line.matchAll(/(?<![\p{L}\p{N}_])(утром|утра|днем|днём|дня|вечером|вечера|ночью|ночи)(?![\p{L}\p{N}_])/giu)) {
    if (!addRecognizedToken(tokens, match, "time", "время")) {
      continue;
    }
    const field = dateFieldFromTimeContext(line, match.index, firstDateField);
    const time = timeFromDayPart(match[1]);
    if (field === "scheduledAt") {
      scheduledAt = withTime(baseDateForTime(field, scheduledAt, deadline), time);
    } else {
      deadline = withTime(baseDateForTime(field, scheduledAt, deadline), time);
    }
  }

  for (const match of line.matchAll(/(?<![\p{L}\p{N}_])в\s+([01]?\d|2[0-3])(?![\p{L}\p{N}_])/gu)) {
    if (!addRecognizedToken(tokens, match, "time", "время")) {
      continue;
    }
    const field = dateFieldFromTimeContext(line, match.index, firstDateField);
    const time = `${padDatePart(Number(match[1]))}:00`;
    if (field === "scheduledAt") {
      scheduledAt = withTime(baseDateForTime(field, scheduledAt, deadline), time);
    } else {
      deadline = withTime(baseDateForTime(field, scheduledAt, deadline), time);
    }
  }

  if (reminderOffsetMinutes !== null) {
    const reminderBase = deadline || scheduledAt;
    reminderAt = subtractMinutes(reminderBase, reminderOffsetMinutes);
  }

  const recognizedTokens = compactRecognizedTokens(tokens);
  const title = removeRecognizedText(line, recognizedTokens) || line;

  return {
    title,
    description: line,
    sourceText: line,
    status,
    scheduledAt,
    deadline,
    priority,
    plannedDurationMinutes,
    actualDurationMinutes: "",
    reminderAt,
    reminderText,
    recurrence,
    tags: tags.join(", "),
    assigneeName,
    recognizedTokens,
  };
}

export const parseCaptureLine = parseQuickTaskLine;

export function aiTaskToCaptureDraft(task: ParsedTaskCandidate): CaptureTaskDraft {
  return {
    title: stringValue(task.title),
    description: stringValue(task.description),
    sourceText: stringValue(task.description) || stringValue(task.title),
    status: normalizeStatus(task.status),
    priority: normalizePriority(task.priority),
    scheduledAt: toDateTimeInputValue(stringValue(task.scheduled_at)),
    deadline: toDateTimeInputValue(stringValue(task.deadline)),
    plannedDurationMinutes: numberValue(task.planned_duration_minutes),
    actualDurationMinutes: numberValue(task.actual_duration_minutes),
    reminderAt: toDateTimeInputValue(stringValue(task.reminder_at)),
    reminderText: stringValue(task.reminder_text),
    recurrence: stringValue(task.recurrence),
    tags: Array.isArray(task.tags) ? task.tags.join(", ") : "",
    assigneeName: stringValue(task.assignee_name),
    recognizedTokens: [],
  };
}

function applyPriorityRules(
  line: string,
  tokens: RecognizedToken[],
  onPriority: (priority: CaptureTaskPriority) => void,
) {
  const rules: Array<{ pattern: RegExp; priority: CaptureTaskPriority; label: string }> = [
    { pattern: /(?:^|\s)(p1|п1|!!!|!!|срочно|критично)(?![\p{L}\p{N}_])/giu, priority: "urgent", label: "срочный приоритет" },
    { pattern: /(?:^|\s)(p2|п2|важно|важная|важный|высокий|high)(?![\p{L}\p{N}_])/giu, priority: "high", label: "высокий приоритет" },
    { pattern: /(?:^|\s)(p3|п3|medium|средний)(?![\p{L}\p{N}_])/giu, priority: "medium", label: "средний приоритет" },
    { pattern: /(?:^|\s)(p4|п4|low|низк(?:ий|ая|ое)?)(?![\p{L}\p{N}_])/giu, priority: "low", label: "низкий приоритет" },
  ];

  rules.forEach((rule) => {
    for (const match of line.matchAll(rule.pattern)) {
      if (addRecognizedToken(tokens, match, "priority", rule.label)) {
        onPriority(rule.priority);
      }
    }
  });
}

function applyStatusRules(
  line: string,
  tokens: RecognizedToken[],
  onStatus: (status: CaptureTaskStatus) => void,
) {
  const rules: Array<{ pattern: RegExp; status: CaptureTaskStatus; label: string }> = [
    { pattern: /(?:^|\s)(не\s+(?:выполнен[ао]?|сделан[ао]?|готово)|todo|open|inbox)(?![\p{L}\p{N}_])/giu, status: "inbox", label: "статус" },
    { pattern: /(?:^|\s)(сделано|готово|выполнено|done)(?![\p{L}\p{N}_])/giu, status: "done", label: "статус" },
    { pattern: /(?:^|\s)(в работе|в процессе|делаю|начато|active)(?![\p{L}\p{N}_])/giu, status: "active", label: "статус" },
    { pattern: /(?:^|\s)(отменено|отменить|отмена|cancelled|canceled)(?![\p{L}\p{N}_])/giu, status: "cancelled", label: "статус" },
  ];

  rules.forEach((rule) => {
    for (const match of line.matchAll(rule.pattern)) {
      if (addRecognizedToken(tokens, match, "status", rule.label)) {
        onStatus(rule.status);
      }
    }
  });
}

function addRecognizedToken(
  tokens: RecognizedToken[],
  match: RegExpMatchArray,
  kind: RecognizedTokenKind,
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

function compactRecognizedTokens(tokens: RecognizedToken[]) {
  const compacted: RecognizedToken[] = [];
  tokens
    .slice()
    .sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start))
    .forEach((token) => {
      if (!compacted.some((item) => rangesOverlap(token.start, token.end, item.start, item.end))) {
        compacted.push(token);
      }
    });
  return compacted.sort((left, right) => left.start - right.start);
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function strongerPriority(current: CaptureTaskPriority, next: CaptureTaskPriority): CaptureTaskPriority {
  const rank: Record<CaptureTaskPriority, number> = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };
  return rank[next] > rank[current] ? next : current;
}

function dateFieldFromPrefix(prefix: string | undefined): "scheduledAt" | "deadline" {
  return explicitDateFieldFromContext(prefix ?? "") ?? "scheduledAt";
}

function dateFieldFromTimeContext(
  line: string,
  matchIndex: number | undefined,
  fallback: "scheduledAt" | "deadline" | null,
): "scheduledAt" | "deadline" {
  return explicitDateFieldFromContext(line.slice(0, matchIndex ?? 0)) ?? fallback ?? "scheduledAt";
}

function explicitDateFieldFromContext(value: string): "scheduledAt" | "deadline" | null {
  const normalized = value.toLowerCase().trim();
  if (/(?:^|[\s,;:])(?:до|дедлайн|к)\s*[:\-]?$/.test(normalized)) {
    return "deadline";
  }
  if (/(?:^|[\s,;:])(?:когда|начать|старт|с)\s*[:\-]?$/.test(normalized)) {
    return "scheduledAt";
  }
  return null;
}

function baseDateForTime(field: "scheduledAt" | "deadline", scheduledAt: string, deadline: string) {
  if (field === "deadline") {
    return deadline || scheduledAt || todayDate();
  }
  return scheduledAt || deadline || todayDate();
}

function durationToMinutes(amount: string, unit: string) {
  return String(durationToMinuteNumber(amount, unit));
}

function durationToMinuteNumber(amount: string, unit: string) {
  const numericAmount = Number.parseInt(amount, 10);
  if (!Number.isFinite(numericAmount)) {
    return 0;
  }
  if (/^(день|дня|дней)$/i.test(unit)) {
    return numericAmount * 24 * 60;
  }
  return /^(ч|час|часа|часов|h)$/i.test(unit) ? numericAmount * 60 : numericAmount;
}

function parseNumericDate(dayValue: string, monthValue: string, yearValue?: string) {
  return dateFromParts(Number(dayValue), Number(monthValue), parseYear(yearValue));
}

function parseMonthNameDate(dayValue: string, monthName: string) {
  const month = RUSSIAN_MONTHS[monthName.toLowerCase()];
  return month ? dateFromParts(Number(dayValue), month) : "";
}

function parseRelativeDate(value: string) {
  const normalized = value.toLowerCase();
  const offset = normalized === "послезавтра" ? 2 : normalized === "завтра" ? 1 : 0;
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatDateOnly(date);
}

function parseWeekdayDate(value: string) {
  const targetDay = RUSSIAN_WEEKDAYS[value.toLowerCase()];
  if (targetDay === undefined) {
    return "";
  }
  const date = new Date();
  const currentDay = date.getDay();
  const offset = (targetDay - currentDay + 7) % 7;
  date.setDate(date.getDate() + offset);
  return formatDateOnly(date);
}

function parseYear(value?: string) {
  if (!value) {
    return null;
  }
  const year = Number(value);
  if (!Number.isFinite(year)) {
    return null;
  }
  return year < 100 ? 2000 + year : year;
}

function dateFromParts(day: number, month: number, explicitYear: number | null = null) {
  if (!Number.isFinite(day) || !Number.isFinite(month) || day < 1 || month < 1 || month > 12) {
    return "";
  }

  const today = new Date();
  const year = explicitYear ?? today.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return "";
  }

  if (explicitYear === null && startOfDay(candidate).getTime() < startOfDay(today).getTime()) {
    candidate.setFullYear(year + 1);
  }
  return formatDateOnly(candidate);
}

function todayDate() {
  return formatDateOnly(new Date());
}

function withTime(dateOrDateTime: string, time: string) {
  const date = dateOrDateTime.slice(0, 10) || todayDate();
  return `${date}T${time}`;
}

function subtractMinutes(dateTime: string, minutes: number) {
  if (!dateTime) {
    return "";
  }
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setMinutes(date.getMinutes() - minutes);
  return `${formatDateOnly(date)}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function dateTimeFromNow(minutes: number) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return `${formatDateOnly(date)}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function timeFromDayPart(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "утром" || normalized === "утра") {
    return "09:00";
  }
  if (normalized === "днем" || normalized === "днём" || normalized === "дня") {
    return "13:00";
  }
  if (normalized === "вечером" || normalized === "вечера") {
    return "18:00";
  }
  return "22:00";
}

function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function trimRecognizedText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function removeRecognizedText(line: string, tokens: RecognizedToken[]) {
  let cleaned = "";
  let cursor = 0;
  tokens.forEach((token) => {
    cleaned += line.slice(cursor, token.start);
    cursor = token.end;
  });
  cleaned += line.slice(cursor);
  return cleaned
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:])/g, "$1")
    .replace(/^[,.:;–—-]+|[,.:;–—-]+$/g, "")
    .trim();
}

const RUSSIAN_MONTHS: Record<string, number> = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

const RUSSIAN_WEEKDAYS: Record<string, number> = {
  вс: 0,
  воскресенье: 0,
  воскресенью: 0,
  воскресенья: 0,
  пн: 1,
  понедельник: 1,
  понедельнику: 1,
  понедельника: 1,
  вт: 2,
  вторник: 2,
  вторнику: 2,
  вторника: 2,
  ср: 3,
  среда: 3,
  среду: 3,
  среде: 3,
  среды: 3,
  чт: 4,
  четверг: 4,
  четвергу: 4,
  четверга: 4,
  пт: 5,
  пятница: 5,
  пятницу: 5,
  пятнице: 5,
  пятницы: 5,
  сб: 6,
  суббота: 6,
  субботу: 6,
  субботе: 6,
  субботы: 6,
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
