"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DragEvent, FocusEvent, ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  Menu,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { ShellSidebarNav } from "@/components/shell-sidebar-nav";
import { formatCountBadge, getMobilePageTitle, normalizeShellPathname } from "@/components/shell-nav-utils";
import { countInboxEntries } from "@/features/inbox/inbox-helpers";
import { useAuth } from "@/hooks/use-auth";
import { useNavOrder } from "@/hooks/use-nav-order";
import { getErrorMessage, listEntries } from "@/lib/api";
import { entryModuleHref, formatDate, getString } from "@/lib/entry-helpers";
import { formatEntryType } from "@/lib/labels";
import { NOTIFICATION_VISIBLE_ROUTES, ROUTES, parseTrackingTab, type TrackingTab } from "@/lib/navigation";
import type { NavItemId } from "@/lib/nav-config";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

function readNavDragPayload(event: DragEvent<HTMLElement>): NavItemId | null {
  const raw = event.dataTransfer.getData("application/x-folio-nav-item");
  if (!raw) {
    return null;
  }
  return raw as NavItemId;
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

async function fetchShellBadgeEntries(token: string) {
  const [tasks, reminders, notes] = await Promise.all([
    listEntries(token, { type: "task", limit: 200 }),
    listEntries(token, { type: "reminder", limit: 100 }),
    listEntries(token, { type: "note", limit: 80 }),
  ]);
  return [...tasks.items, ...reminders.items, ...notes.items];
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
  const {
    items: sidebarNavigation,
    isReorderMode,
    setIsReorderMode,
    dragOverId,
    setDragOverId,
    moveItem,
    resetOrder,
  } = useNavOrder(user?.id);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [hoveredNavIndex, setHoveredNavIndex] = useState<number | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [notifications, setNotifications] = useState<Entry[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [isDesktopSidebar, setIsDesktopSidebar] = useState<boolean | null>(null);
  const [isMobileNavMounted, setIsMobileNavMounted] = useState(false);
  const [currentTrackingTab, setCurrentTrackingTab] = useState<TrackingTab>("habits");
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeNotificationsRef = useRef<HTMLButtonElement>(null);
  const closeMobileNavRef = useRef<HTMLButtonElement>(null);
  const mobileNavDialogId = "mobile-nav-drawer";
  const notificationsDialogId = "shell-notifications-menu";
  const isOverlayOpen = isNotificationsOpen || isMobileNavOpen;
  const mobilePageTitle = getMobilePageTitle(pathname);
  const initials = userInitials(user?.full_name, user?.email);

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


  const displayName = user?.full_name || user?.email || "Пользователь";
  const notificationStorageKey = user?.id ? `folio_one_seen_notifications:${user.id}` : null;
  const unreadNotificationCount = NOTIFICATION_VISIBLE_ROUTES.has(pathname)
    ? 0
    : notifications.filter((entry) => !seenNotificationIds.includes(notificationSeenId(entry))).length;
  const isBoardRoute = pathname === ROUTES.board;
  const isNotesRoute = pathname === ROUTES.notes;
  const shellPath = normalizeShellPathname(pathname);
  const isTranscriptionRoute = shellPath === ROUTES.transcription || shellPath === "/transcription";
  const isImmersiveRoute = isNotesRoute || isTranscriptionRoute;
  const showDesktopHeader = !isBoardRoute && !isImmersiveRoute;

  useEffect(() => {
    setIsMobileNavMounted(true);
  }, []);

  useEffect(() => {
    if (pathname !== ROUTES.tracking) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setCurrentTrackingTab(parseTrackingTab(params.get("tab")));
  }, [pathname]);

  useEffect(() => {
    setIsNotificationsOpen(false);
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    function updateSidebarMode(event?: MediaQueryListEvent) {
      const isDesktop = event?.matches ?? mediaQuery.matches;
      setIsDesktopSidebar(isDesktop);
      if (isDesktop) {
        setIsMobileNavOpen(false);
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

    fetchShellBadgeEntries(token)
      .then((items) => {
        if (isMounted) {
          setNotifications(items.filter(isNotificationEntry).slice(0, 8));
          setInboxCount(countInboxEntries(items));
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
  }, [token]);

  function reloadNotifications() {
    if (!token) {
      return;
    }

    setIsNotificationsLoading(true);
    setNotificationsError(null);
    fetchShellBadgeEntries(token)
      .then((items) => {
        setNotifications(items.filter(isNotificationEntry).slice(0, 8));
        setInboxCount(countInboxEntries(items));
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
    if (!isMobileNavOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMobileNav();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }
    closeNotificationsRef.current?.focus();
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }
    closeMobileNavRef.current?.focus();
  }, [isMobileNavOpen]);

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
    if (!isNotificationsOpen && !isMobileNavOpen) {
      return;
    }

    const dialogId = isMobileNavOpen ? mobileNavDialogId : notificationsDialogId;
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
  }, [isNotificationsOpen, isMobileNavOpen]);

  function closeNotifications() {
    setIsNotificationsOpen(false);
    bellButtonRef.current?.focus();
  }

  function closeMobileNav() {
    setIsMobileNavOpen(false);
    menuButtonRef.current?.focus();
  }

  function openNotifications() {
    setIsMobileNavOpen(false);
    setIsNotificationsOpen((current) => !current);
  }

  function toggleMobileNav() {
    setIsNotificationsOpen(false);
    setIsMobileNavOpen((current) => !current);
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
    setIsReorderMode(false);
    setDragOverId(null);
    setIsSidebarExpanded((current) => !current);
  }

  function handleNavDragStart(event: DragEvent<HTMLElement>, itemId: NavItemId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-folio-nav-item", itemId);
  }

  function handleNavDrop(event: DragEvent<HTMLElement>, targetId: NavItemId) {
    event.preventDefault();
    const sourceId = readNavDragPayload(event);
    if (!sourceId) {
      return;
    }
    moveItem(sourceId, targetId);
  }

  const bellAriaLabel =
    unreadNotificationCount > 0
      ? `Показать уведомления, непрочитанных: ${formatCountBadge(unreadNotificationCount)}`
      : "Показать уведомления";

  const shellSidebarProps = {
    pathname,
    currentTrackingTab,
    sidebarNavigation,
    inboxCount,
    isSidebarExpanded,
    isReorderMode,
    dragOverId,
    hoveredNavIndex,
    displayName,
    userEmail: user?.email,
    userInitials: initials,
    onHoverNavIndex: setHoveredNavIndex,
    onSetReorderMode: setIsReorderMode,
  onSetDragOverId: setDragOverId,
  onResetOrder: resetOrder,
    onToggleSidebar: toggleSidebar,
    onLogout: handleLogout,
    onDragStart: handleNavDragStart,
    onDrop: handleNavDrop,
    onSidebarBlur: handleSidebarBlur,
  };

  function renderNotificationPanel() {
    return (
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
          className="fixed right-4 top-[calc(var(--shell-mobile-header)+0.5rem)] z-50 flex max-h-[min(560px,calc(100dvh-var(--shell-mobile-header)-2rem))] w-[min(390px,calc(100vw-2rem))] flex-col rounded-md border border-border bg-card shadow-panel md:right-5 md:top-[calc(var(--shell-desktop-header)+0.5rem)] lg:max-h-[min(560px,calc(100dvh-var(--shell-desktop-header)-2rem))]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-6">Уведомления</h2>
              <p className="text-sm text-muted-foreground">Задачи и напоминания, которые требуют внимания</p>
            </div>
            <Button ref={closeNotificationsRef} variant="ghost" size="icon" aria-label="Закрыть уведомления" onClick={closeNotifications}>
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
    );
  }

  function renderShellActions(className?: string) {
    return (
      <div className={cn("ml-auto flex items-center gap-2 lg:gap-3", className)}>
        <Button variant="outline" size="icon" asChild className="size-11 lg:hidden" aria-label="Поиск">
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
          {isNotificationsOpen ? renderNotificationPanel() : null}
        </div>
      </div>
    );
  }

  const mainPaddingClass = cn(
    "pb-[env(safe-area-inset-bottom)] lg:pb-6",
    isBoardRoute || isImmersiveRoute ? "p-0 lg:p-0" : "p-5 lg:p-6",
  );

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="focus-ring sr-only fixed left-4 top-4 z-50 rounded-md bg-card px-4 py-3 text-sm font-medium text-foreground shadow-panel focus:not-sr-only"
      >
        К содержимому
      </a>

      <div
        className={cn(
          "min-h-dvh lg:grid",
          isSidebarExpanded ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-[72px_1fr]",
        )}
      >
        <aside
          className={cn(
            "relative z-40 hidden border-b border-border bg-card lg:sticky lg:top-0 lg:block lg:h-dvh lg:border-b-0 lg:border-r lg:overflow-visible lg:transition-[width] lg:duration-200 lg:motion-reduce:transition-none",
            isSidebarExpanded ? "lg:w-[260px]" : "lg:w-[72px]",
          )}
          aria-hidden={isDesktopSidebar === null ? undefined : !isDesktopSidebar}
          inert={isDesktopSidebar === false ? true : undefined}
          onMouseLeave={() => setHoveredNavIndex(null)}
        >
          <ShellSidebarNav variant="desktop" {...shellSidebarProps} />
        </aside>

        <div className="flex h-dvh max-h-dvh min-w-0 flex-col overflow-hidden">
          <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur lg:hidden">
            <div className="flex min-h-16 items-center gap-3 px-4">
              <Button
                ref={menuButtonRef}
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0 touch-manipulation"
                aria-label="Меню"
                aria-expanded={isMobileNavOpen}
                aria-haspopup="dialog"
                aria-controls={mobileNavDialogId}
                onClick={toggleMobileNav}
              >
                <Menu data-icon />
              </Button>
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{mobilePageTitle}</h1>
              {renderShellActions()}
            </div>
          </header>

          {showDesktopHeader ? (
            <header className="sticky top-0 z-30 hidden border-b border-border bg-card/95 backdrop-blur lg:block">
              <div className="flex min-h-[72px] items-center justify-between gap-5 px-6 md:grid md:grid-cols-[minmax(190px,1fr)_minmax(280px,700px)_auto]">
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
                {renderShellActions()}
              </div>
            </header>
          ) : null}

          <main
            id="main-content"
            tabIndex={-1}
            className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none", mainPaddingClass, contentClassName)}
          >
            {children}
          </main>

          {isMobileNavMounted && isMobileNavOpen
            ? createPortal(
                <>
                  <button
                    type="button"
                    aria-label="Закрыть меню"
                    className="fixed inset-0 z-[90] bg-foreground/20 lg:hidden"
                    onClick={closeMobileNav}
                  />
                  <section
                    id={mobileNavDialogId}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Навигация"
                    className="fixed inset-y-0 left-0 z-[100] flex w-[min(280px,85vw)] flex-col border-r border-border bg-card shadow-panel lg:hidden"
                    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                  >
                    <div className="flex shrink-0 items-center justify-end border-b border-border px-3 py-2">
                      <Button ref={closeMobileNavRef} variant="ghost" size="icon" aria-label="Закрыть меню" onClick={closeMobileNav}>
                        <X data-icon />
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <ShellSidebarNav variant="drawer" {...shellSidebarProps} onNavClick={closeMobileNav} />
                    </div>
                  </section>
                </>,
                document.body,
              )
            : null}
        </div>
      </div>
    </div>
  );
}
