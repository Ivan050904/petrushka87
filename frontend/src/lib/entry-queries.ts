import type { Entry, EntryType } from "@/lib/types";

import { formatDateKey } from "@/lib/habits";
import { getAgendaEntries, getDashboard, listEntries, type AgendaBundle } from "@/lib/api";
import {
  filterInboxEntries,
  isInboxReminder,
} from "@/features/inbox/inbox-helpers";

export const SEARCH_RESULT_LIMIT = 100;
export const AGENDA_FETCH_LIMIT = 500;

function mergeEntries(...groups: Entry[][]): Entry[] {
  const seen = new Set<string>();
  const merged: Entry[] = [];
  for (const group of groups) {
    for (const entry of group) {
      if (seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      merged.push(entry);
    }
  }
  return merged;
}

export async function fetchDashboardEntries(token: string): Promise<Entry[]> {
  const todayKey = formatDateKey(new Date());
  const [summary, tasks, events, reminders, habits, food, inboxNotes] = await Promise.all([
    getDashboard(token),
    listEntries(token, { type: "task", limit: 200 }),
    listEntries(token, { type: "event", limit: 200 }),
    listEntries(token, { type: "reminder", limit: 100 }),
    listEntries(token, { type: "habit", limit: 100 }),
    listEntries(token, { type: "food", entry_date_from: todayKey, entry_date_to: todayKey, limit: 100 }),
    listEntries(token, { type: "note", metadata_source: "dashboard", limit: 30 }),
  ]);

  return mergeEntries(
    summary.active_tasks,
    summary.recent_notes,
    tasks.items,
    events.items,
    reminders.items,
    habits.items,
    food.items,
    inboxNotes.items,
  );
}

export async function fetchInboxEntries(token: string): Promise<Entry[]> {
  const [inboxTasks, reminders, dashboardNotes] = await Promise.all([
    listEntries(token, { type: "task", metadata_status: "inbox", limit: 200 }),
    listEntries(token, { type: "reminder", limit: 200 }),
    listEntries(token, { type: "note", metadata_source: "dashboard", limit: 50 }),
  ]);

  const filteredReminders = reminders.items.filter(isInboxReminder);
  const filteredNotes = filterInboxEntries(dashboardNotes.items).filter((entry) => entry.type === "note");

  return mergeEntries(inboxTasks.items, filteredReminders, filteredNotes);
}

export async function searchEntriesBounded(
  token: string,
  params: {
    q?: string;
    type?: EntryType;
    limit?: number;
  } = {},
): Promise<{ items: Entry[]; total: number }> {
  const result = await listEntries(token, {
    q: params.q,
    type: params.type,
    limit: params.limit ?? SEARCH_RESULT_LIMIT,
    offset: 0,
  });
  return result;
}

export async function fetchAgendaEntries(token: string): Promise<AgendaBundle> {
  return getAgendaEntries(token);
}

export function agendaEntriesFromBundle(bundle: AgendaBundle): Entry[] {
  return mergeEntries(bundle.tasks, bundle.events, bundle.reminders);
}
