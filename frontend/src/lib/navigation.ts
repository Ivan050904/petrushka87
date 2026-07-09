export const ROUTES = {
  dashboard: "/dashboard",
  inbox: "/inbox",
  journal: "/journal",
  board: "/board",
  plans: "/plans",
  tracking: "/tracking",
  reference: "/reference",
  search: "/search",
  login: "/login",
} as const;

export type PlansTab = "all" | "tasks" | "events" | "reminders";
export type TrackingTab = "habits" | "finance" | "food";
export type ReferenceTab = "people" | "resources";

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

export const NOTIFICATION_VISIBLE_ROUTES = new Set<string>([ROUTES.dashboard, ROUTES.plans]);
