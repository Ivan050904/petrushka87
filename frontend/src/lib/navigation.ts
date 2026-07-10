export const ROUTES = {
  dashboard: "/dashboard",
  inbox: "/inbox",
  journal: "/journal",
  notes: "/notes",
  board: "/board",
  plans: "/plans",
  tracking: "/tracking",
  transcription: "/transcription",
  assistant: "/assistant",
  articles: "/articles",
  reference: "/reference",
  search: "/search",
  login: "/login",
} as const;

export type PlansTab = "all" | "tasks" | "events" | "reminders";
export type TrackingTab = "habits" | "finance" | "food";
export type ReferenceTab = "people" | "resources";

export const TRACKING_TAB_LINKS = [
  { tab: "habits" as const, label: "Привычки" },
  { tab: "finance" as const, label: "Финансы" },
  { tab: "food" as const, label: "Питание" },
] as const;

export function parseTrackingTab(value: string | null): TrackingTab {
  if (value === "finance" || value === "food") {
    return value;
  }
  return "habits";
}

export function trackingTabHref(tab: TrackingTab, selected?: string) {
  return trackingHref({
    tab: tab === "habits" ? undefined : tab,
    selected,
  });
}

export function plansHref(options?: { tab?: PlansTab; selected?: string }) {
  const params = new URLSearchParams();
  if (options?.tab && options.tab !== "all") {
    params.set("tab", options.tab);
  }
  if (options?.selected) {
    params.set("selected", options.selected);
  }
  const query = params.toString();
  return query ? `${ROUTES.plans}?${query}` : ROUTES.plans;
}

export function trackingHref(options?: { tab?: TrackingTab; selected?: string }) {
  const params = new URLSearchParams();
  if (options?.tab) {
    params.set("tab", options.tab);
  }
  if (options?.selected) {
    params.set("selected", options.selected);
  }
  const query = params.toString();
  return query ? `${ROUTES.tracking}?${query}` : ROUTES.tracking;
}

export function referenceHref(options?: { tab?: ReferenceTab; selected?: string }) {
  const params = new URLSearchParams();
  if (options?.tab) {
    params.set("tab", options.tab);
  }
  if (options?.selected) {
    params.set("selected", options.selected);
  }
  const query = params.toString();
  return query ? `${ROUTES.reference}?${query}` : ROUTES.reference;
}

export function journalHref(selected?: string) {
  if (!selected) {
    return ROUTES.journal;
  }
  return `${ROUTES.journal}?selected=${encodeURIComponent(selected)}`;
}

export function notesHref(selected?: string) {
  if (!selected) {
    return ROUTES.notes;
  }
  return `${ROUTES.notes}?id=${encodeURIComponent(selected)}`;
}

export function notesNewHref() {
  return `${ROUTES.notes}?new=1`;
}

export type KanbanBoardMode = import("@/lib/dev-kanban").KanbanBoardMode;

export function parseKanbanBoardMode(value: string | null): KanbanBoardMode {
  if (value === "tasks" || value === "psych") {
    return value;
  }
  return "code";
}

export function boardHref(options?: { boardId?: string; mode?: KanbanBoardMode }) {
  if (options?.boardId && options.boardId !== "kanban_code") {
    return `${ROUTES.board}?board=${encodeURIComponent(options.boardId)}`;
  }
  if (options?.mode && options.mode !== "code") {
    return `${ROUTES.board}?mode=${options.mode}`;
  }
  return ROUTES.board;
}

export const NOTIFICATION_VISIBLE_ROUTES = new Set<string>([ROUTES.dashboard, ROUTES.plans]);
