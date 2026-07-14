export const ROUTES = {
  dashboard: "/dashboard",
  inbox: "/inbox",
  notes: "/notes",
  board: "/board",
  plans: "/plans",
  tracking: "/tracking",
  /** Frontend voice UI — not `/transcription` (backend YouTube module on nginx). */
  transcription: "/transcribe",
  therapySessions: "/therapy-sessions",
  assistant: "/assistant",
  articles: "/articles",
  reference: "/reference",
  weather: "/weather",
  search: "/search",
  settings: "/settings",
  login: "/login",
} as const;

export type PlansTab = "all" | "tasks" | "events" | "reminders";
export type TrackingTab = "habits" | "finance" | "food" | "workouts";
export type FinancePanelView = "import" | "operations" | "dashboard";
export type ReferenceTab = "people" | "resources";
export type WeatherCityId = "moscow" | "spb" | "novosibirsk" | "vladivostok" | "norilsk";

export const TRACKING_TAB_LINKS = [
  { tab: "habits" as const, label: "Привычки" },
  { tab: "finance" as const, label: "Финансы" },
  { tab: "food" as const, label: "Питание" },
  { tab: "workouts" as const, label: "Зал" },
] as const;

export function parseTrackingTab(value: string | null): TrackingTab {
  if (value === "finance" || value === "food" || value === "workouts") {
    return value;
  }
  return "habits";
}

export function parseFinancePanelView(value: string | null): FinancePanelView | null {
  if (value === "import" || value === "operations" || value === "dashboard") {
    return value;
  }
  return null;
}

export function trackingFinanceDashboardHref() {
  return trackingHref({ tab: "finance", financeView: "dashboard" });
}

export function trackingTabHref(tab: TrackingTab, selected?: string, financeView?: FinancePanelView) {
  return trackingHref({
    tab: tab === "habits" ? undefined : tab,
    selected,
    financeView: tab === "finance" ? financeView : undefined,
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

export function trackingHref(options?: {
  tab?: TrackingTab;
  selected?: string;
  financeView?: FinancePanelView;
}) {
  const params = new URLSearchParams();
  if (options?.tab) {
    params.set("tab", options.tab);
  }
  if (options?.selected) {
    params.set("selected", options.selected);
  }
  if (options?.financeView) {
    params.set("financeView", options.financeView);
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

export function notesHref(selected?: string) {
  if (!selected) {
    return ROUTES.notes;
  }
  return `${ROUTES.notes}?id=${encodeURIComponent(selected)}`;
}

export function notesNewHref() {
  return `${ROUTES.notes}?new=1`;
}

export function parseWeatherCityId(value: string | null): WeatherCityId | null {
  if (
    value === "moscow" ||
    value === "spb" ||
    value === "novosibirsk" ||
    value === "vladivostok" ||
    value === "norilsk"
  ) {
    return value;
  }
  return null;
}

export function weatherHref(cityId?: WeatherCityId) {
  if (!cityId) {
    return ROUTES.weather;
  }
  return `${ROUTES.weather}?city=${encodeURIComponent(cityId)}`;
}

export type KanbanBoardMode = import("@/lib/kanban-boards").KanbanBoardMode;

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
