export type EntryType = "task" | "reminder" | "event" | "finance" | "habit" | "food" | "person" | "note" | "diary" | "resource";

export const ENTRY_TYPES = ["task", "reminder", "event", "finance", "habit", "food", "person", "note", "diary", "resource"] as const satisfies readonly EntryType[];

export const MVP_ENTRY_TYPES = ["task", "reminder", "event", "finance", "habit", "person", "note", "diary", "resource"] as const satisfies readonly EntryType[];

export type User = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: "bearer";
  user: User;
};

export type Entry = {
  id: string;
  type: EntryType;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EntryList = {
  items: Entry[];
  total: number;
};

export type DashboardSummary = {
  total_entries: number;
  active_task_count: number;
  recent_expense_count: number;
  latest_entries: Entry[];
  active_tasks: Entry[];
  recent_expenses: Entry[];
  recent_notes: Entry[];
};
