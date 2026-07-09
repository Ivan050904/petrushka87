"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, ReactNode } from "react";
import {
  Bell,
  Bot,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronsLeft,
  ChevronsRight,
  Kanban,
  Ellipsis,
  Flame,
  Home,
  Inbox,
  Library,
  LogOut,
  Mic,
  Repeat,
  Search,
  Settings,
  StickyNote,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { countInboxEntries } from "@/features/inbox/inbox-helpers";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage, listEntries } from "@/lib/api";
import { entryModuleHref, formatDate, getString } from "@/lib/entry-helpers";
import { formatEntryType } from "@/lib/labels";
import { NOTIFICATION_VISIBLE_ROUTES, ROUTES, parseTrackingTab, trackingTabHref, type TrackingTab } from "@/lib/navigation";
import type { Entry } from "@/lib/types";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  showInboxCount?: boolean;
  trackingTab?: TrackingTab;
};

const navigation: NavItem[] = [
  { href: ROUTES.dashboard, label: "Сегодня", icon: Home },
  { href: ROUTES.inbox, label: "Входящие", icon: Inbox, showInboxCount: true },
  { href: ROUTES.board, label: "Канбан", icon: Kanban },
  { href: ROUTES.notes, label: "Заметки", icon: StickyNote },
  { href: ROUTES.journal, label: "Журнал", icon: BookOpen },
  { href: ROUTES.plans, label: "Планы", icon: CalendarRange },
  { href: trackingTabHref("habits"), label: "Привычки", icon: Repeat, trackingTab: "habits" },
  { href: trackingTabHref("finance"), label: "Финансы", icon: Wallet, trackingTab: "finance" },
  { href: trackingTabHref("food"), label: "Питание", icon: Flame, trackingTab: "food" },
  { href: ROUTES.transcription, label: "Транскрибация", icon: Mic },
  { href: ROUTES.assistant, label: "Ассистент", icon: Bot },
  { href: ROUTES.reference, label: "Справочник", icon: Library },
];

const mobileTabNavigation: NavItem[] = [
  { href: ROUTES.dashboard, label: "Сегодня", icon: Home },
  { href: ROUTES.inbox, label: "Входящие", icon: Inbox, showInboxCount: true },
  { href: ROUTES.plans, label: "Планы", icon: CalendarRange },
  { href: trackingTabHref("habits"), label: "Привычки", icon: Repeat, trackingTab: "habits" },
];

const mobileMoreNavigation: NavItem[] = [
  { href: ROUTES.board, label: "Канбан", icon: Kanban },
  { href: ROUTES.notes, label: "Заметки", icon: StickyNote },
  { href: ROUTES.journal, label: "Журнал", icon: BookOpen },
  { href: trackingTabHref("finance"), label: "Финансы", icon: Wallet, trackingTab: "finance" },
  { href: trackingTabHref("food"), label: "Питание", icon: Flame, trackingTab: "food" },
  { href: ROUTES.transcription, label: "Транскрибация", icon: Mic },
  { href: ROUTES.assistant, label: "Ассистент", icon: Bot },
  { href: ROUTES.reference, label: "Справочник", icon: Library },
];

function isNavItemActive(
  pathname: string,
  href: string,
  options?: { trackingTab?: TrackingTab; currentTrackingTab?: TrackingTab },
) {
  if (options?.trackingTab) {
    return pathname === ROUTES.tracking && options.currentTrackingTab === options.trackingTab;
  }
  return pathname === href || (href !== ROUTES.dashboard && pathname.startsWith(`${href}`));
}

function notificationSeenId(entry: Entry) {
  return `${entry.id}:${entry.updated_at}`;
}

function isOpenTask(entry: Entry) {
  return entry.type === "task" && !["done", "cancelled"].includes(getString(entry.metadata.status, "inbox"));
}

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

function isNotificationEntry(entry: Entry) {
  if (isOpenTask(entry)) {
    const deadline = getString(entry.metadata.deadline);
    return Boolean(deadline) && (isDue(deadline) || isToday(deadline));
  }

  if (entry.type === "reminder" && !["done", "cancelled"].includes(getString(entry.metadata.status, "scheduled"))) {
    const remindAt = getString(entry.metadata.remind_at);
    return Boolean(remindAt) && isDue(remindAt);
  }

  return false;
}

function notificationText(entry: Entry) {
  if (entry.type === "reminder") {
    return entry.title;
  }
  if (isDue(getString(entry.metadata.deadline))) {
    return `Просрочена задача: ${entry.title}`;
  }
  return `Сегодня задача: ${entry.title}`;
}

function userInitials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "LC").trim();
  const parts = source.includes("@") ? [source[0]] : source.split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function SidebarPeekLabel({
  children,
  active = false,
  tone,
}: {
  children: ReactNode;
  active?: boolean;
  tone: "primary" | "neighbor" | "hidden";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "sidebar-peek-label pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 hidden whitespace-nowrap rounded-md border shadow-panel backdrop-blur will-change-transform lg:inline-flex",
        tone === "primary"
          ? "-translate-y-1/2 translate-x-0 scale-100 px-3.5 py-2.5 text-[15px] font-semibold opacity-100"
          : tone === "neighbor"
            ? "-translate-y-1/2 translate-x-0 scale-[0.92] px-3 py-1.5 text-sm font-medium opacity-[0.86]"
            : "-translate-x-2 -translate-y-1/2 scale-[0.86] px-3 py-1.5 text-sm font-medium opacity-0",
        tone === "primary" && active
          ? "border-primary/60 bg-primary text-primary-foreground shadow-[0_16px_34px_hsl(var(--primary)/0.22)]"
        : tone === "primary"
            ? "border-primary/50 bg-card/95 text-foreground ring-1 ring-primary/20"
            : tone === "neighbor" && active
              ? "border-primary/35 bg-primary/10 text-foreground"
              : tone === "neighbor"
                ? "border-border bg-card/90 text-muted-foreground"
                : "border-transparent bg-card/80 text-muted-foreground shadow-none",
      )}
    >
      {children}
    </span>
  );
}

function formatCountBadge(value: number) {
  if (value > 9) {
    return "9+";
  }
  return String(value);
}

export function AppShell({
  children,
  contentClassName,
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [hoveredNavIndex, setHoveredNavIndex] = useState<number | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [notifications, setNotifications] = useState<Entry[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [isDesktopSidebar, setIsDesktopSidebar] = useState<boolean | null>(null);
  const [currentTrackingTab, setCurrentTrackingTab] = useState<TrackingTab>("habits");
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeNotificationsRef = useRef<HTMLButtonElement>(null);
  const closeMoreRef = useRef<HTMLButtonElement>(null);
  const moreDialogId = "mobile-more-menu";
  const notificationsDialogId = "shell-notifications-menu";
  const isOverlayOpen = isNotificationsOpen || isMoreOpen;

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        weekday: "long",
      }).format(new Date()),
    [],
  );

  const isSidebarOpen = isSidebarExpanded;
  const displayName = user?.full_name || user?.email || "Пользователь";
  const notificationStorageKey = user?.id ? `folio_one_seen_notifications:${user.id}` : null;
  const unreadNotificationCount = NOTIFICATION_VISIBLE_ROUTES.has(pathname)
    ? 0
    : notifications.filter((entry) => !seenNotificationIds.includes(notificationSeenId(entry))).length;
  const isBoardRoute = pathname === ROUTES.board;
  const isNotesRoute = pathname === ROUTES.notes;
  const isImmersiveRoute = isBoardRoute || isNotesRoute;
  const isMobileMoreActive = mobileMoreNavigation.some((item) =>
    isNavItemActive(pathname, item.href, {
      trackingTab: item.trackingTab,
      currentTrackingTab,
    }),
  );

  useEffect(() => {
    if (pathname !== ROUTES.tracking) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setCurrentTrackingTab(parseTrackingTab(params.get("tab")));
  }, [pathname]);

  useEffect(() => {
    setIsNotificationsOpen(false);
    setIsMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    function updateSidebarMode(event?: MediaQueryListEvent) {
      const isDesktop = event?.matches ?? mediaQuery.matches;
      setIsDesktopSidebar(isDesktop);
      if (isDesktop) {
        setIsMoreOpen(false);
      }
    }
    updateSidebarMode();
    mediaQuery.addEventListener("change", updateSidebarMode);
    return () => mediaQuery.removeEventListener("change", updateSidebarMode);
  }, []);

  useEffect(() => {
    if (!notificationStorageKey) {
      setSeenNotificationIds([]);
      return;
    }

    try {
      const parsed = JSON.parse(window.localStorage.getItem(notificationStorageKey) ?? "[]") as unknown;
      setSeenNotificationIds(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
    } catch {
      setSeenNotificationIds([]);
    }
  }, [notificationStorageKey]);

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setInboxCount(0);
      setIsNotificationsLoading(false);
      return;
    }

    let isMounted = true;
    setIsNotificationsLoading(true);
    setNotificationsError(null);
    listEntries(token, { limit: 100 })
      .then((result) => {
        if (isMounted) {
          setNotifications(result.items.filter(isNotificationEntry).slice(0, 8));
          setInboxCount(countInboxEntries(result.items));
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setNotificationsError(getErrorMessage(requestError, "Не удалось загрузить уведомления."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsNotificationsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token, pathname]);

  function reloadNotifications() {
    if (!token) {
      return;
    }

    setIsNotificationsLoading(true);
    setNotificationsError(null);
    listEntries(token, { limit: 100 })
      .then((result) => {
        setNotifications(result.items.filter(isNotificationEntry).slice(0, 8));
        setInboxCount(countInboxEntries(result.items));
      })
      .catch((requestError) => {
        setNotificationsError(getErrorMessage(requestError, "Не удалось загрузить уведомления."));
      })
      .finally(() => {
        setIsNotificationsLoading(false);
      });
  }

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNotifications();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMoreMenu();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }
    closeNotificationsRef.current?.focus();
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }
    closeMoreRef.current?.focus();
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isOverlayOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOverlayOpen]);

  useEffect(() => {
    if (!isNotificationsOpen && !isMoreOpen) {
      return;
    }

    const dialogId = isMoreOpen ? moreDialogId : notificationsDialogId;
    const dialogElement = document.getElementById(dialogId);
    if (!dialogElement) {
      return;
    }

    function trapFocus(event: KeyboardEvent) {
      if (!dialogElement) {
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialogElement.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialogElement.addEventListener("keydown", trapFocus);
    return () => dialogElement.removeEventListener("keydown", trapFocus);
  }, [isNotificationsOpen, isMoreOpen]);

  function closeNotifications() {
    setIsNotificationsOpen(false);
    bellButtonRef.current?.focus();
  }

  function closeMoreMenu() {
    setIsMoreOpen(false);
    moreButtonRef.current?.focus();
  }

  function openNotifications() {
    setIsMoreOpen(false);
    setIsNotificationsOpen((current) => !current);
  }

  function openMoreMenu() {
    setIsNotificationsOpen(false);
    setIsMoreOpen((current) => !current);
  }

  useEffect(() => {
    if (!notificationStorageKey || notifications.length === 0) {
      return;
    }
    if (!isNotificationsOpen && !NOTIFICATION_VISIBLE_ROUTES.has(pathname)) {
      return;
    }

    const nextSeen = Array.from(new Set([...seenNotificationIds, ...notifications.map(notificationSeenId)])).slice(-80);
    if (nextSeen.length === seenNotificationIds.length) {
      return;
    }

    setSeenNotificationIds(nextSeen);
    try {
      window.localStorage.setItem(notificationStorageKey, JSON.stringify(nextSeen));
    } catch {
      return;
    }
  }, [isNotificationsOpen, notificationStorageKey, notifications, pathname, seenNotificationIds]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  function handleSidebarBlur(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
      setHoveredNavIndex(null);
    }
  }

  function toggleSidebar() {
    setHoveredNavIndex(null);
    setIsSidebarExpanded((current) => !current);
  }

  function getPeekTone(index: number) {
    if (isSidebarExpanded || hoveredNavIndex === null) {
      return "hidden";
    }

    const distance = Math.abs(index - hoveredNavIndex);
    if (distance === 0) {
      return "primary";
    }
    if (distance === 1) {
      return "neighbor";
    }
    return "hidden";
  }

  const bellAriaLabel =
    unreadNotificationCount > 0
      ? `Показать уведомления, непрочитанных: ${formatCountBadge(unreadNotificationCount)}`
      : "Показать уведомления";

  const sidebarLinkBase = cn(
    "focus-ring group flex min-h-12 shrink-0 items-center rounded-md border text-base font-medium transition",
    isSidebarOpen ? "gap-4 px-3" : "gap-3 px-3 lg:w-12 lg:justify-center lg:px-0",
  );
  const sidebarTextClass = cn("truncate", !isSidebarOpen && "lg:sr-only");

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="focus-ring sr-only fixed left-4 top-4 z-50 rounded-md bg-card px-4 py-3 text-sm font-medium text-foreground shadow-panel focus:not-sr-only"
      >
        К содержимому
      </a>

      <div className={cn("min-h-dvh lg:grid", isSidebarExpanded ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-[72px_1fr]")}>
        <aside
          className={cn(
            "relative z-40 hidden border-b border-border bg-card lg:sticky lg:top-0 lg:block lg:h-dvh lg:border-b-0 lg:border-r lg:overflow-visible lg:transition-[width] lg:duration-200 lg:motion-reduce:transition-none",
            isSidebarExpanded ? "lg:w-[260px]" : "lg:w-[72px]",
          )}
          aria-hidden={isDesktopSidebar === null ? undefined : !isDesktopSidebar}
          inert={isDesktopSidebar === false ? true : undefined}
          onMouseLeave={() => setHoveredNavIndex(null)}
          onBlur={handleSidebarBlur}
        >
          <div className={cn("flex h-full flex-col p-4", isSidebarExpanded ? "overflow-hidden" : "overflow-visible", !isSidebarOpen && "lg:px-3")}>
            <Link
              href={ROUTES.dashboard}
              onMouseEnter={() => setHoveredNavIndex(null)}
              onFocus={() => setHoveredNavIndex(null)}
              className={cn(
                "focus-ring relative mb-4 flex min-h-12 items-center rounded-md",
                isSidebarOpen ? "gap-3 px-1" : "gap-3 px-1 lg:justify-center lg:px-0",
              )}
              aria-label={BRAND_NAME}
            >
              <BrandMark size={40} />
              <span className={cn("truncate text-xl font-semibold tracking-tight text-foreground", !isSidebarOpen && "lg:sr-only")}>
                Folio<span className="text-primary">-One</span>
              </span>
            </Link>

            <nav
              aria-label="Основная навигация"
              className="flex flex-col gap-2 overflow-visible pb-0"
              onMouseLeave={() => setHoveredNavIndex(null)}
            >
              {navigation.map((item, index) => {
                const isActive = isNavItemActive(pathname, item.href, {
                  trackingTab: item.trackingTab,
                  currentTrackingTab,
                });
                const peekTone = getPeekTone(index);
                const navInboxCount = "showInboxCount" in item && item.showInboxCount ? inboxCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onMouseEnter={() => setHoveredNavIndex(index)}
                    onFocus={() => setHoveredNavIndex(index)}
                    className={cn(
                      "relative",
                      sidebarLinkBase,
                      isActive
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                    <span className={sidebarTextClass}>{item.label}</span>
                    {navInboxCount > 0 && pathname !== ROUTES.inbox ? (
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground",
                          !isSidebarOpen && "lg:absolute lg:-right-1 lg:-top-1",
                        )}
                      >
                        {formatCountBadge(navInboxCount)}
                      </span>
                    ) : null}
                    {!isSidebarExpanded ? (
                      <SidebarPeekLabel active={isActive} tone={peekTone}>
                        {item.label}
                      </SidebarPeekLabel>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div
              className={cn("mt-auto flex flex-col gap-2 border-t border-border pt-3", !isSidebarOpen && "lg:items-center")}
              onMouseEnter={() => setHoveredNavIndex(null)}
            >
              <button
                type="button"
                disabled
                aria-disabled="true"
                title="Скоро"
                onFocus={() => setHoveredNavIndex(null)}
                className={cn(
                  "focus-ring relative flex min-h-12 cursor-not-allowed items-center rounded-md border border-transparent text-left text-base font-medium text-muted-foreground opacity-50",
                  isSidebarOpen ? "gap-4 px-3" : "gap-3 px-3 lg:w-12 lg:justify-center lg:px-0",
                )}
              >
                <Settings aria-hidden="true" className="size-5 shrink-0" />
                <span className={sidebarTextClass}>Настройки</span>
              </button>

              <div
                className={cn(
                  "relative flex min-h-12 items-center rounded-md border border-border bg-background",
                  isSidebarOpen ? "gap-3 px-3" : "gap-3 px-3 lg:w-12 lg:justify-center lg:border-transparent lg:bg-transparent lg:px-0",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/25 text-sm font-semibold text-foreground">
                  {userInitials(user?.full_name, user?.email)}
                </span>
                <div className={cn("min-w-0 flex-1", !isSidebarOpen && "lg:sr-only")}>
                  <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                  {user?.email ? <div className="truncate text-xs text-muted-foreground">{user.email}</div> : null}
                </div>
                {isSidebarOpen ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    aria-label="Выйти"
                    onFocus={() => setHoveredNavIndex(null)}
                    className="focus-ring flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                aria-label={isSidebarExpanded ? "Свернуть боковое меню" : "Развернуть боковое меню"}
                aria-expanded={isSidebarExpanded}
                onClick={toggleSidebar}
                onFocus={() => setHoveredNavIndex(null)}
                className={cn(
                  "focus-ring relative flex min-h-10 cursor-pointer items-center rounded-md border border-transparent text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground",
                  isSidebarOpen ? "justify-center gap-2 px-3" : "justify-center gap-2 px-3 lg:w-12 lg:px-0",
                )}
              >
                {isSidebarExpanded ? <ChevronsLeft aria-hidden="true" className="size-5" /> : <ChevronsRight aria-hidden="true" className="size-5" />}
                <span className={cn("truncate", !isSidebarOpen && "lg:sr-only")}>{isSidebarExpanded ? "Свернуть" : "Развернуть"}</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="flex h-dvh max-h-dvh min-w-0 flex-col overflow-hidden">
          {!isImmersiveRoute ? (
          <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 md:grid md:min-h-[72px] md:grid-cols-[minmax(190px,1fr)_minmax(280px,700px)_auto] md:gap-5 md:px-6">
              <Link href={ROUTES.dashboard} className="focus-ring flex shrink-0 items-center rounded-md lg:hidden" aria-label={BRAND_NAME}>
                <BrandMark size={36} />
              </Link>

              <div className="hidden min-w-0 items-center gap-3 text-base font-medium capitalize text-foreground md:flex">
                <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                <span className="truncate first-letter:uppercase">{todayLabel}</span>
              </div>

              <Button variant="outline" asChild className="hidden min-h-12 justify-start gap-3 text-muted-foreground md:inline-flex">
                <Link href={ROUTES.search}>
                  <Search data-icon="inline-start" />
                  Поиск по записям, задачам, людям...
                </Link>
              </Button>

              <div className="ml-auto flex items-center gap-2 lg:gap-3">
                <Button variant="outline" size="icon" asChild className="size-11 md:hidden" aria-label="Поиск">
                  <Link href={ROUTES.search}>
                    <Search data-icon />
                  </Link>
                </Button>
                <div className="relative">
                  <Button
                    ref={bellButtonRef}
                    variant="outline"
                    size="icon"
                    aria-label={bellAriaLabel}
                    aria-expanded={isNotificationsOpen}
                    aria-haspopup="dialog"
                    aria-controls={notificationsDialogId}
                    onClick={() => openNotifications()}
                    className="size-11 lg:size-12"
                  >
                    <Bell data-icon />
                  </Button>
                  {unreadNotificationCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-card bg-secondary text-[11px] font-semibold leading-none text-secondary-foreground">
                      <span className="sr-only">Непрочитанных: {formatCountBadge(unreadNotificationCount)}</span>
                      <span aria-hidden="true">{formatCountBadge(unreadNotificationCount)}</span>
                    </span>
                  ) : null}

                  {isNotificationsOpen ? (
                    <>
                      <button
                        type="button"
                        aria-label="Закрыть уведомления"
                        className="fixed inset-0 z-[45] bg-foreground/10"
                        onClick={closeNotifications}
                      />
                      <section
                        id={notificationsDialogId}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Последние уведомления"
                        aria-busy={isNotificationsLoading}
                        className="fixed right-4 top-[calc(var(--shell-mobile-header)+0.5rem)] z-50 flex max-h-[min(560px,calc(100dvh-var(--shell-mobile-header)-var(--shell-mobile-tab)-2rem))] w-[min(390px,calc(100vw-2rem))] flex-col rounded-md border border-border bg-card shadow-panel md:right-5 md:top-[calc(var(--shell-desktop-header)+0.5rem)] lg:max-h-[min(560px,calc(100dvh-var(--shell-desktop-header)-2rem))]"
                      >
                      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                        <div className="min-w-0">
                          <h2 className="text-base font-semibold leading-6">Уведомления</h2>
                          <p className="text-sm text-muted-foreground">Задачи и напоминания, которые требуют внимания</p>
                        </div>
                        <Button
                          ref={closeNotificationsRef}
                          variant="ghost"
                          size="icon"
                          aria-label="Закрыть уведомления"
                          onClick={closeNotifications}
                        >
                          <X data-icon />
                        </Button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {isNotificationsLoading ? (
                          <p className="px-1 py-2 text-sm text-muted-foreground">Загрузка уведомлений…</p>
                        ) : notificationsError ? (
                          <div className="flex flex-col gap-3 px-1 py-2">
                            <p className="text-sm text-destructive">{notificationsError}</p>
                            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => reloadNotifications()}>
                              Повторить
                            </Button>
                          </div>
                        ) : notifications.length === 0 ? (
                          <Empty title="Ничего срочного" />
                        ) : (
                          <div className="flex flex-col">
                            {notifications.map((entry) => (
                              <Link
                                key={entry.id}
                                href={entryModuleHref(entry)}
                                onClick={closeNotifications}
                                className="focus-ring flex min-h-12 items-center justify-between gap-3 border-b border-border px-2 py-2 transition last:border-b-0 hover:bg-muted"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium" title={notificationText(entry)}>
                                    {notificationText(entry)}
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">{formatDate(entry.updated_at)}</div>
                                </div>
                                <Badge variant="secondary">{formatEntryType(entry.type)}</Badge>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </header>
          ) : null}

          <main
            id="main-content"
            tabIndex={-1}
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none",
              isImmersiveRoute
                ? "p-0 pb-[calc(var(--shell-mobile-tab)+env(safe-area-inset-bottom))] lg:pb-0"
                : "p-5 pb-[calc(var(--shell-mobile-tab)+env(safe-area-inset-bottom))] lg:p-6 lg:pb-6",
              contentClassName,
            )}
          >
            {children}
          </main>

          <nav
            aria-label="Мобильная навигация"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
          >
            <div className="grid min-h-[var(--shell-mobile-tab)] grid-cols-5 px-1 pt-1">
              {mobileTabNavigation.map((item) => {
                const isActive = isNavItemActive(pathname, item.href, {
                  trackingTab: item.trackingTab,
                  currentTrackingTab,
                });
                const navInboxCount = "showInboxCount" in item && item.showInboxCount ? inboxCount : 0;
                const inboxAriaLabel =
                  navInboxCount > 0 && pathname !== ROUTES.inbox
                    ? `${item.label}, неразобранных: ${formatCountBadge(navInboxCount)}`
                    : item.label;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    aria-label={navInboxCount > 0 && pathname !== ROUTES.inbox ? inboxAriaLabel : undefined}
                    className={cn(
                      "focus-ring relative mx-1 flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span className="relative shrink-0">
                      <item.icon aria-hidden="true" className="size-5 shrink-0" />
                      {navInboxCount > 0 && pathname !== ROUTES.inbox ? (
                        <span
                          aria-hidden="true"
                          className="absolute -right-2 -top-1.5 flex size-4 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-secondary-foreground"
                        >
                          {formatCountBadge(navInboxCount)}
                        </span>
                      ) : null}
                    </span>
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                );
              })}
              <button
                ref={moreButtonRef}
                type="button"
                aria-label="Ещё"
                aria-expanded={isMoreOpen}
                aria-haspopup="dialog"
                aria-controls={moreDialogId}
                onClick={() => openMoreMenu()}
                className={cn(
                  "focus-ring mx-1 flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition",
                  isMobileMoreActive || isMoreOpen ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <Ellipsis aria-hidden="true" className="size-5 shrink-0" />
                <span>Ещё</span>
              </button>
            </div>
          </nav>

          {isMoreOpen ? (
            <>
              <button
                type="button"
                aria-label="Закрыть меню"
                className="fixed inset-0 z-[45] bg-foreground/10 lg:hidden"
                onClick={closeMoreMenu}
              />
              <section
                id={moreDialogId}
                role="dialog"
                aria-modal="true"
                aria-label="Дополнительные разделы"
                className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(85dvh,calc(100dvh-var(--shell-mobile-tab)))] flex-col rounded-t-md border border-border bg-card shadow-panel lg:hidden"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <h2 className="text-base font-semibold leading-6">Ещё</h2>
                  <Button
                    ref={closeMoreRef}
                    variant="ghost"
                    size="icon"
                    aria-label="Закрыть меню"
                    onClick={closeMoreMenu}
                  >
                    <X data-icon />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex flex-col gap-1 p-3">
                  {mobileMoreNavigation.map((item) => {
                    const isActive = isNavItemActive(pathname, item.href, {
                      trackingTab: item.trackingTab,
                      currentTrackingTab,
                    });
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => setIsMoreOpen(false)}
                        className={cn(
                          "focus-ring flex min-h-12 items-center gap-3 rounded-md border px-3 text-base font-medium transition",
                          isActive
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <item.icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                        {item.label}
                      </Link>
                    );
                  })}
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Скоро"
                    className="focus-ring flex min-h-12 cursor-not-allowed items-center gap-3 rounded-md border border-transparent px-3 text-left text-base font-medium text-muted-foreground opacity-50"
                  >
                    <Settings aria-hidden="true" className="size-5 shrink-0" />
                    Настройки
                  </button>
                </div>
                <div className="border-t border-border p-3">
                  <div className="flex min-h-12 items-center gap-3 rounded-md border border-border bg-background px-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/25 text-sm font-semibold text-foreground"
                    >
                      {userInitials(user?.full_name, user?.email)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                      {user?.email ? <div className="truncate text-xs text-muted-foreground">{user.email}</div> : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      aria-label={`Выйти из аккаунта ${displayName}`}
                      className="focus-ring flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <LogOut aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
