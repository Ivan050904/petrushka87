import type { Entry } from "@/lib/types";

import { entryModuleHref, getString } from "@/lib/entry-helpers";
import { referenceHref } from "@/lib/navigation";

export type AgendaKind = "task" | "event" | "reminder" | "birthday";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  title: string;
  date: Date;
  href: string;
  entry?: Entry;
};

export type CalendarDay = {
  key: string;
  date: Date;
  inMonth: boolean;
  items: AgendaItem[];
};

export type PlansScope = "today" | "week" | "overdue" | "all";
export type PlansTypeFilter = "all" | "tasks" | "events" | "reminders";

export function parseEntryDate(value: unknown) {
  const rawValue = typeof value === "string" ? value : "";
  if (!rawValue) {
    return null;
  }
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T09:00` : rawValue;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function isTaskClosed(task: Entry) {
  return ["done", "cancelled"].includes(getString(task.metadata.status, "inbox"));
}

function birthdayNextOccurrence(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const today = new Date();
  const [, month, day] = value.split("-").map(Number);
  const birthday = new Date(today.getFullYear(), month - 1, day, 9, 0);
  if (birthday < startOfDay(today)) {
    birthday.setFullYear(today.getFullYear() + 1);
  }
  return birthday;
}

function entryAgendaItem(entry: Entry, kind: Exclude<AgendaKind, "birthday">, date: Date, href: string): AgendaItem {
  return { id: `${kind}-${entry.id}`, kind, title: entry.title, date, href, entry };
}

export function buildAgendaItems(entries: Entry[]): AgendaItem[] {
  return entries.flatMap((entry) => {
    if (entry.type === "task" && !isTaskClosed(entry)) {
      const date = parseEntryDate(entry.metadata.scheduled_at) ?? parseEntryDate(entry.metadata.deadline);
      return date ? [entryAgendaItem(entry, "task", date, entryModuleHref(entry))] : [];
    }
    if (entry.type === "event" && !["skipped", "cancelled"].includes(getString(entry.metadata.status))) {
      const date = parseEntryDate(entry.metadata.starts_at);
      return date ? [entryAgendaItem(entry, "event", date, entryModuleHref(entry))] : [];
    }
    if (entry.type === "reminder" && !["done", "cancelled"].includes(getString(entry.metadata.status, "scheduled"))) {
      const date = parseEntryDate(entry.metadata.remind_at);
      return date ? [entryAgendaItem(entry, "reminder", date, entryModuleHref(entry))] : [];
    }
    if (entry.type === "person") {
      const birthday = birthdayNextOccurrence(getString(entry.metadata.birthday));
      return birthday
        ? [
            {
              id: `birthday-${entry.id}`,
              kind: "birthday" as const,
              title: getString(entry.metadata.full_name, entry.title),
              date: birthday,
              href: referenceHref({ tab: "people", selected: entry.id }),
              entry,
            },
          ]
        : [];
    }
    return [];
  });
}

export function sortAgendaItems(left: AgendaItem, right: AgendaItem) {
  return left.date.getTime() - right.date.getTime() || agendaRank(left.kind) - agendaRank(right.kind);
}

function agendaRank(kind: AgendaKind) {
  return kind === "task" ? 1 : kind === "event" ? 2 : kind === "reminder" ? 3 : 4;
}

export function isUpcomingVisible(value: Date) {
  return value >= startOfDay(new Date());
}

export type DaySection = "now" | "laterToday" | "tomorrow";

export const DAY_SECTION_LABELS: Record<DaySection, string> = {
  now: "Сейчас",
  laterToday: "Позже сегодня",
  tomorrow: "Завтра",
};

const NOW_WINDOW_MS = 60 * 60 * 1000;

export function groupAgendaForDashboard(items: AgendaItem[], reference = new Date()) {
  const today = startOfDay(reference);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  const nowThreshold = reference.getTime() + NOW_WINDOW_MS;

  const groups: Record<DaySection, AgendaItem[]> = {
    now: [],
    laterToday: [],
    tomorrow: [],
  };

  for (const item of items.filter((entry) => isUpcomingVisible(entry.date)).sort(sortAgendaItems)) {
    const time = item.date.getTime();
    if (isSameDay(item.date, today)) {
      if (time <= nowThreshold) {
        groups.now.push(item);
      } else {
        groups.laterToday.push(item);
      }
      continue;
    }
    if (time >= tomorrow.getTime() && time < tomorrowEnd.getTime()) {
      groups.tomorrow.push(item);
    }
  }

  return groups;
}

export function countAgendaTasksToday(items: AgendaItem[], reference = new Date()) {
  const today = startOfDay(reference);
  return items.filter((item) => isSameDay(item.date, today) && item.kind === "task").length;
}

export function countAgendaToday(items: AgendaItem[], reference = new Date()) {
  const today = startOfDay(reference);
  return items.filter((item) => isSameDay(item.date, today)).length;
}

export function countAgendaEventsToday(items: AgendaItem[], reference = new Date()) {
  const today = startOfDay(reference);
  return items.filter((item) => isSameDay(item.date, today) && (item.kind === "event" || item.kind === "birthday")).length;
}

export function buildWeekDays(referenceDate: Date, items: AgendaItem[]): CalendarDay[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const start = new Date(year, month, referenceDate.getDate());
  start.setDate(referenceDate.getDate() - ((referenceDate.getDay() + 6) % 7));

  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: formatDateOnly(date),
      date,
      inMonth: date.getMonth() === month,
      items: items.filter((item) => isSameDay(item.date, date)).sort(sortAgendaItems),
    };
  });
}

export function agendaKindForType(type: PlansTypeFilter): AgendaKind | null {
  if (type === "tasks") {
    return "task";
  }
  if (type === "events") {
    return "event";
  }
  if (type === "reminders") {
    return "reminder";
  }
  return null;
}

export function filterPlansItems(items: AgendaItem[], scope: PlansScope, typeFilter: PlansTypeFilter) {
  const now = startOfDay(new Date());
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const kind = agendaKindForType(typeFilter);
  let filtered = kind ? items.filter((item) => item.kind === kind) : items.filter((item) => item.kind !== "birthday");

  if (scope === "today") {
    filtered = filtered.filter((item) => isSameDay(item.date, now));
  } else if (scope === "week") {
    filtered = filtered.filter((item) => item.date >= now && item.date < weekEnd);
  } else if (scope === "overdue") {
    filtered = filtered.filter((item) => item.date < now && item.kind === "task");
  }

  return filtered.sort(sortAgendaItems);
}

export function formatAgendaDateTime(value: Date) {
  const options: Intl.DateTimeFormatOptions = isSameDay(value, new Date())
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("ru-RU", options).format(value);
}

export function formatWeekday(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(value).replace(".", "");
}

export function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(value);
}

export function agendaLabel(kind: AgendaKind) {
  if (kind === "task") {
    return "Задача";
  }
  if (kind === "event") {
    return "Событие";
  }
  if (kind === "birthday") {
    return "День рождения";
  }
  return "Напоминание";
}

export function agendaDotClass(kind: AgendaKind) {
  if (kind === "task") {
    return "bg-secondary";
  }
  if (kind === "event") {
    return "bg-primary";
  }
  if (kind === "birthday") {
    return "bg-accent";
  }
  return "bg-muted-foreground";
}
