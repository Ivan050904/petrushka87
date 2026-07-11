import {
  Brain,
  Bot,
  CalendarRange,
  Dumbbell,
  Flame,
  Home,
  Inbox,
  Kanban,
  Library,
  Mic,
  Newspaper,
  Repeat,
  StickyNote,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  ROUTES,
  trackingTabHref,
  type TrackingTab,
} from "@/lib/navigation";

export type NavItemId =
  | "dashboard"
  | "inbox"
  | "board"
  | "notes"
  | "articles"
  | "plans"
  | "tracking-habits"
  | "tracking-finance"
  | "tracking-food"
  | "tracking-workouts"
  | "transcription"
  | "therapy-sessions"
  | "assistant"
  | "reference";

export type NavItemConfig = {
  id: NavItemId;
  href: string;
  label: string;
  icon: LucideIcon;
  showInboxCount?: boolean;
  trackingTab?: TrackingTab;
};

export const NAV_ITEMS: Record<NavItemId, NavItemConfig> = {
  dashboard: { id: "dashboard", href: ROUTES.dashboard, label: "Сегодня", icon: Home },
  inbox: { id: "inbox", href: ROUTES.inbox, label: "Входящие", icon: Inbox, showInboxCount: true },
  board: { id: "board", href: ROUTES.board, label: "Канбан", icon: Kanban },
  notes: { id: "notes", href: ROUTES.notes, label: "Заметки", icon: StickyNote },
  articles: { id: "articles", href: ROUTES.articles, label: "Статьи", icon: Newspaper },
  plans: { id: "plans", href: ROUTES.plans, label: "Планы", icon: CalendarRange },
  "tracking-habits": {
    id: "tracking-habits",
    href: trackingTabHref("habits"),
    label: "Привычки",
    icon: Repeat,
    trackingTab: "habits",
  },
  "tracking-finance": {
    id: "tracking-finance",
    href: trackingTabHref("finance"),
    label: "Финансы",
    icon: Wallet,
    trackingTab: "finance",
  },
  "tracking-food": {
    id: "tracking-food",
    href: trackingTabHref("food"),
    label: "Питание",
    icon: Flame,
    trackingTab: "food",
  },
  "tracking-workouts": {
    id: "tracking-workouts",
    href: trackingTabHref("workouts"),
    label: "Зал",
    icon: Dumbbell,
    trackingTab: "workouts",
  },
  transcription: { id: "transcription", href: ROUTES.transcription, label: "Транскрибация", icon: Mic },
  "therapy-sessions": {
    id: "therapy-sessions",
    href: ROUTES.therapySessions,
    label: "Сессии",
    icon: Brain,
  },
  assistant: { id: "assistant", href: ROUTES.assistant, label: "Чат с контекстом", icon: Bot },
  reference: { id: "reference", href: ROUTES.reference, label: "Справочник", icon: Library },
};

export const DEFAULT_NAV_ORDER: NavItemId[] = [
  "dashboard",
  "inbox",
  "board",
  "notes",
  "articles",
  "plans",
  "tracking-habits",
  "tracking-finance",
  "tracking-food",
  "tracking-workouts",
  "transcription",
  "therapy-sessions",
  "assistant",
  "reference",
];

export const MOBILE_TAB_NAV_IDS: NavItemId[] = ["dashboard", "inbox", "plans", "tracking-habits"];

export const NAV_ORDER_STORAGE_PREFIX = "folio_one_sidebar_nav_order";

export function sanitizeNavOrder(order: unknown): NavItemId[] {
  if (!Array.isArray(order)) {
    return [...DEFAULT_NAV_ORDER];
  }

  const known = new Set(DEFAULT_NAV_ORDER);
  const seen = new Set<NavItemId>();
  const sanitized: NavItemId[] = [];

  for (const value of order) {
    if (typeof value !== "string" || !known.has(value as NavItemId) || seen.has(value as NavItemId)) {
      continue;
    }
    const id = value as NavItemId;
    seen.add(id);
    sanitized.push(id);
  }

  for (const id of DEFAULT_NAV_ORDER) {
    if (!seen.has(id)) {
      sanitized.push(id);
    }
  }

  return sanitized;
}

export function readNavOrder(userId: string | null | undefined): NavItemId[] {
  if (!userId || typeof window === "undefined") {
    return [...DEFAULT_NAV_ORDER];
  }

  try {
    const raw = window.localStorage.getItem(`${NAV_ORDER_STORAGE_PREFIX}:${userId}`);
    if (!raw) {
      return [...DEFAULT_NAV_ORDER];
    }
    return sanitizeNavOrder(JSON.parse(raw));
  } catch {
    return [...DEFAULT_NAV_ORDER];
  }
}

export function writeNavOrder(userId: string, order: NavItemId[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(`${NAV_ORDER_STORAGE_PREFIX}:${userId}`, JSON.stringify(sanitizeNavOrder(order)));
}

export function getNavItemsInOrder(order: NavItemId[]): NavItemConfig[] {
  return sanitizeNavOrder(order).map((id) => NAV_ITEMS[id]);
}

export function reorderNavItems(order: NavItemId[], sourceId: NavItemId, targetId: NavItemId): NavItemId[] {
  if (sourceId === targetId) {
    return order;
  }

  const sanitized = sanitizeNavOrder(order);
  const fromIndex = sanitized.indexOf(sourceId);
  const toIndex = sanitized.indexOf(targetId);
  if (fromIndex < 0 || toIndex < 0) {
    return sanitized;
  }

  const next = [...sanitized];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, sourceId);
  return next;
}
