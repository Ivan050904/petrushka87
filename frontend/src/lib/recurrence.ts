import type { Entry } from "@/lib/types";

import { weekdayShortLabel } from "@/lib/habits";

export type WeeklyRecurrenceRule = {
  kind: "weekly";
  weekdays: number[];
  time: string;
};

export type TaskRecurrenceRule = WeeklyRecurrenceRule | null;
export type RecurrenceExceptionStatus = "skipped";
export type RecurrenceExceptions = Record<string, RecurrenceExceptionStatus>;

export type TaskRecurrenceMetadata = {
  recurrence: TaskRecurrenceRule;
  recurrence_exceptions: RecurrenceExceptions;
  skipped_weeks: string[];
};

export function parseEntryDate(value: unknown) {
  const rawValue = typeof value === "string" ? value : "";
  if (!rawValue) {
    return null;
  }
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T09:00` : rawValue;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function readTaskRecurrence(metadata: Record<string, unknown>): TaskRecurrenceRule {
  const value = metadata.recurrence;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  if (source.kind !== "weekly") {
    return null;
  }

  const weekdays = Array.isArray(source.weekdays)
    ? Array.from(
        new Set(
          source.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7),
        ),
      ).sort()
    : [];

  const time = typeof source.time === "string" && /^\d{2}:\d{2}$/.test(source.time) ? source.time : "09:00";

  if (weekdays.length === 0) {
    return null;
  }

  return { kind: "weekly", weekdays, time };
}

export function readRecurrenceExceptions(metadata: Record<string, unknown>): RecurrenceExceptions {
  const value = metadata.recurrence_exceptions;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, status]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && status === "skipped",
    ),
  ) as RecurrenceExceptions;
}

export function readSkippedWeeks(metadata: Record<string, unknown>): string[] {
  const value = metadata.skipped_weeks;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item));
}

export function readTaskRecurrenceMetadata(metadata: Record<string, unknown>): TaskRecurrenceMetadata {
  return {
    recurrence: readTaskRecurrence(metadata),
    recurrence_exceptions: readRecurrenceExceptions(metadata),
    skipped_weeks: readSkippedWeeks(metadata),
  };
}

export function recurrenceMetadataPayload(data: TaskRecurrenceMetadata): Record<string, unknown> {
  return {
    recurrence: data.recurrence,
    recurrence_exceptions: data.recurrence_exceptions,
    skipped_weeks: data.skipped_weeks,
  };
}

export function isRecurringTask(metadata: Record<string, unknown>) {
  return readTaskRecurrence(metadata)?.kind === "weekly";
}

export function recurrenceRuleLabel(rule: WeeklyRecurrenceRule) {
  return `Каждую неделю: ${rule.weekdays.map(weekdayShortLabel).join(", ")} в ${rule.time}`;
}

export function isoWeekday(date: Date) {
  return ((date.getDay() + 6) % 7) + 1;
}

export function getWeekMonday(date: Date) {
  const monday = startOfDay(date);
  monday.setDate(monday.getDate() - (isoWeekday(monday) - 1));
  return monday;
}

export function getWeekMondayKey(date: Date) {
  return formatDateOnly(getWeekMonday(date));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isOccurrenceSkipped(
  metadata: Record<string, unknown>,
  date: Date,
  recurrence?: TaskRecurrenceMetadata,
) {
  const data = recurrence ?? readTaskRecurrenceMetadata(metadata);
  const dateKey = formatDateOnly(date);
  if (data.recurrence_exceptions[dateKey] === "skipped") {
    return true;
  }
  return data.skipped_weeks.includes(getWeekMondayKey(date));
}

export function occurrenceDateTime(rule: WeeklyRecurrenceRule, date: Date) {
  const [hours, minutes] = rule.time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

export function expandWeeklyOccurrences(
  entry: Entry,
  rangeStart: Date,
  rangeEnd: Date,
  options?: { includeSkipped?: boolean },
) {
  const recurrence = readTaskRecurrenceMetadata(entry.metadata);
  const rule = recurrence.recurrence;
  if (!rule || rule.kind !== "weekly") {
    return [];
  }

  const includeSkipped = options?.includeSkipped ?? false;
  const items: Array<{ date: Date; dateKey: string; skipped: boolean }> = [];
  const cursor = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);

  while (cursor <= end) {
    if (rule.weekdays.includes(isoWeekday(cursor))) {
      const skipped = isOccurrenceSkipped(entry.metadata, cursor, recurrence);
      if (!skipped || includeSkipped) {
        items.push({
          date: occurrenceDateTime(rule, cursor),
          dateKey: formatDateOnly(cursor),
          skipped,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return items;
}

export function skipOccurrenceMetadata(metadata: Record<string, unknown>, date: Date) {
  const dateKey = formatDateOnly(date);
  const exceptions = { ...readRecurrenceExceptions(metadata), [dateKey]: "skipped" as const };
  return {
    ...metadata,
    recurrence_exceptions: exceptions,
  };
}

export function skipWeekMetadata(metadata: Record<string, unknown>, date: Date) {
  const weekKey = getWeekMondayKey(date);
  const skippedWeeks = Array.from(new Set([...readSkippedWeeks(metadata), weekKey])).sort();
  return {
    ...metadata,
    skipped_weeks: skippedWeeks,
  };
}

export function restoreOccurrenceMetadata(metadata: Record<string, unknown>, date: Date) {
  const dateKey = formatDateOnly(date);
  const exceptions = { ...readRecurrenceExceptions(metadata) };
  delete exceptions[dateKey];
  return {
    ...metadata,
    recurrence_exceptions: exceptions,
  };
}

export function restoreWeekMetadata(metadata: Record<string, unknown>, date: Date) {
  const weekKey = getWeekMondayKey(date);
  return {
    ...metadata,
    skipped_weeks: readSkippedWeeks(metadata).filter((item) => item !== weekKey),
  };
}

export function defaultAgendaExpansionRange(reference = new Date()) {
  const rangeStart = addDays(getWeekMonday(reference), -7);
  const rangeEnd = addDays(getWeekMonday(reference), 34);
  rangeEnd.setHours(23, 59, 59, 999);
  return { rangeStart, rangeEnd };
}

export function defaultRecurrenceForm() {
  return {
    recurrenceEnabled: false,
    recurrenceWeekdays: [1, 3, 5] as number[],
    recurrenceTime: "09:00",
  };
}

export function recurrenceFormFromMetadata(metadata: Record<string, unknown>) {
  const rule = readTaskRecurrence(metadata);
  if (!rule) {
    return defaultRecurrenceForm();
  }
  return {
    recurrenceEnabled: true,
    recurrenceWeekdays: rule.weekdays,
    recurrenceTime: rule.time,
  };
}

export function recurrenceFormToMetadata(
  metadata: Record<string, unknown>,
  form: {
    recurrenceEnabled: boolean;
    recurrenceWeekdays: number[];
    recurrenceTime: string;
  },
) {
  const next = { ...metadata };
  if (!form.recurrenceEnabled || form.recurrenceWeekdays.length === 0) {
    next.recurrence = null;
    return next;
  }

  next.recurrence = {
    kind: "weekly",
    weekdays: [...form.recurrenceWeekdays].sort(),
    time: /^\d{2}:\d{2}$/.test(form.recurrenceTime) ? form.recurrenceTime : "09:00",
  };
  return next;
}

export function toggleWeekdaySelection(current: number[], day: number) {
  const next = current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort();
  return next.length > 0 ? next : current;
}

export function parseLegacyScheduledTime(metadata: Record<string, unknown>) {
  const scheduled = parseEntryDate(metadata.scheduled_at);
  if (!scheduled) {
    return "09:00";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(scheduled.getHours())}:${pad(scheduled.getMinutes())}`;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export { formatDateOnly, startOfDay, WEEKDAYS, weekdayShortLabel };
