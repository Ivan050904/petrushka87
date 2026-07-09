import type { Entry } from "@/lib/types";

import { getString } from "@/lib/entry-helpers";

const INBOX_NOTE_WINDOW_MS = 48 * 60 * 60 * 1000;

function isDue(value: string) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function isToday(value: string) {
  if (!value) {
    return false;
  }
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function isInboxTask(entry: Entry) {
  return entry.type === "task" && getString(entry.metadata.status, "inbox") === "inbox";
}

export function isInboxReminder(entry: Entry) {
  if (entry.type !== "reminder") {
    return false;
  }
  const status = getString(entry.metadata.status, "scheduled");
  if (["done", "cancelled"].includes(status)) {
    return false;
  }
  const remindAt = getString(entry.metadata.remind_at);
  return Boolean(remindAt) && (isDue(remindAt) || isToday(remindAt));
}

export function isInboxNote(entry: Entry) {
  if (entry.type !== "note") {
    return false;
  }
  if (getString(entry.metadata.source) !== "dashboard") {
    return false;
  }
  const createdAt = new Date(entry.created_at).getTime();
  if (Number.isNaN(createdAt)) {
    return false;
  }
  return Date.now() - createdAt <= INBOX_NOTE_WINDOW_MS;
}

export function isInboxEntry(entry: Entry) {
  return isInboxTask(entry) || isInboxReminder(entry) || isInboxNote(entry);
}

export function filterInboxEntries(entries: Entry[]) {
  return entries.filter(isInboxEntry);
}

export function countInboxEntries(entries: Entry[]) {
  return filterInboxEntries(entries).length;
}

export type InboxGroup = "tasks" | "reminders" | "notes";

export function inboxGroup(entry: Entry): InboxGroup {
  if (entry.type === "task") {
    return "tasks";
  }
  if (entry.type === "reminder") {
    return "reminders";
  }
  return "notes";
}

export const INBOX_GROUP_LABELS: Record<InboxGroup, string> = {
  tasks: "Задачи",
  reminders: "Напоминания",
  notes: "Заметки",
};

export function inboxPreviewTitle(entry: Entry) {
  if (entry.title.trim()) {
    return entry.title;
  }
  if (entry.content.trim()) {
    return entry.content.slice(0, 80);
  }
  return "Без названия";
}
