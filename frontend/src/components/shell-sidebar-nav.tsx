"use client";

import type { DragEvent, FocusEvent, ReactNode } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  GripVertical,
  LogOut,
  Settings,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatCountBadge, isNavItemActive } from "@/components/shell-nav-utils";
import { ROUTES, type TrackingTab } from "@/lib/navigation";
import type { NavItemConfig, NavItemId } from "@/lib/nav-config";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

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

export type ShellSidebarNavProps = {
  variant: "desktop" | "drawer";
  pathname: string;
  currentTrackingTab: TrackingTab;
  sidebarNavigation: NavItemConfig[];
  inboxCount: number;
  isSidebarExpanded: boolean;
  isReorderMode: boolean;
  dragOverId: NavItemId | null;
  hoveredNavIndex: number | null;
  displayName: string;
  userEmail?: string | null;
  userInitials: string;
  onNavClick?: () => void;
  onHoverNavIndex: (index: number | null) => void;
  onSetReorderMode: (value: boolean) => void;
  onSetDragOverId: (value: NavItemId | null | ((current: NavItemId | null) => NavItemId | null)) => void;
  onResetOrder: () => void;
  onToggleSidebar: () => void;
  onLogout: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, itemId: NavItemId) => void;
  onDrop: (event: DragEvent<HTMLElement>, targetId: NavItemId) => void;
  onSidebarBlur?: (event: FocusEvent<HTMLElement>) => void;
};

export function ShellSidebarNav({
  variant,
  pathname,
  currentTrackingTab,
  sidebarNavigation,
  inboxCount,
  isSidebarExpanded,
  isReorderMode,
  dragOverId,
  hoveredNavIndex,
  displayName,
  userEmail,
  userInitials,
  onNavClick,
  onHoverNavIndex,
  onSetReorderMode,
  onSetDragOverId,
  onResetOrder,
  onToggleSidebar,
  onLogout,
  onDragStart,
  onDrop,
  onSidebarBlur,
}: ShellSidebarNavProps) {
  const isDrawer = variant === "drawer";
  const isSidebarOpen = isDrawer || isSidebarExpanded;
  const sidebarLinkBase = cn(
    "focus-ring group flex min-h-12 shrink-0 items-center rounded-md border text-base font-medium transition",
    isSidebarOpen ? "gap-4 px-3" : "gap-3 px-3 lg:w-12 lg:justify-center lg:px-0",
  );
  const sidebarTextClass = cn("truncate", !isSidebarOpen && !isDrawer && "lg:sr-only");

  function getPeekTone(index: number) {
    if (isDrawer || isSidebarExpanded || hoveredNavIndex === null) {
      return "hidden";
    }
    const distance = Math.abs(index - hoveredNavIndex);
    if (distance === 0) return "primary";
    if (distance === 1) return "neighbor";
    return "hidden";
  }

  function renderNavItem(item: NavItemConfig, index: number) {
    const isActive = isNavItemActive(pathname, item.href, {
      trackingTab: item.trackingTab,
      currentTrackingTab,
    });
    const peekTone = getPeekTone(index);
    const navInboxCount = item.showInboxCount ? inboxCount : 0;
    const isDropTarget = isReorderMode && dragOverId === item.id;

    const content = (
      <>
        {isReorderMode ? (
          <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
        <item.icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
        <span className={sidebarTextClass}>{item.label}</span>
        {navInboxCount > 0 && pathname !== ROUTES.inbox ? (
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground",
              !isSidebarOpen && !isDrawer && "lg:absolute lg:-right-1 lg:-top-1",
            )}
          >
            {formatCountBadge(navInboxCount)}
          </span>
        ) : null}
        {!isDrawer && !isSidebarExpanded && !isReorderMode ? (
          <SidebarPeekLabel active={isActive} tone={peekTone}>
            {item.label}
          </SidebarPeekLabel>
        ) : null}
      </>
    );

    if (isReorderMode) {
      return (
        <div
          key={item.id}
          draggable
          onDragStart={(event) => onDragStart(event, item.id)}
          onDragOver={(event) => {
            event.preventDefault();
            onSetDragOverId(item.id);
          }}
          onDragLeave={() => onSetDragOverId((current) => (current === item.id ? null : current))}
          onDrop={(event) => onDrop(event, item.id)}
          onMouseEnter={() => onHoverNavIndex(index)}
          className={cn(
            "relative cursor-grab active:cursor-grabbing",
            sidebarLinkBase,
            isDropTarget
              ? "border-primary/50 bg-primary/10 text-foreground ring-2 ring-primary/20"
              : "border-transparent bg-muted/40 text-muted-foreground",
          )}
        >
          {content}
        </div>
      );
    }

    return (
      <Link
        key={item.id}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavClick}
        onMouseEnter={() => onHoverNavIndex(index)}
        onFocus={() => onHoverNavIndex(index)}
        className={cn(
          "relative",
          sidebarLinkBase,
          isActive
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col p-4",
        isDrawer && "overflow-hidden",
        isSidebarExpanded && !isDrawer ? "overflow-hidden" : !isDrawer && "overflow-visible",
        !isSidebarOpen && !isDrawer && "lg:px-3",
      )}
      onBlur={onSidebarBlur}
    >
      <Link
        href={ROUTES.dashboard}
        onClick={onNavClick}
        onMouseEnter={() => onHoverNavIndex(null)}
        onFocus={() => onHoverNavIndex(null)}
        className={cn(
          "focus-ring relative mb-4 flex min-h-12 items-center rounded-md",
          isSidebarOpen ? "gap-3 px-1" : "gap-3 px-1 lg:justify-center lg:px-0",
        )}
        aria-label={BRAND_NAME}
      >
        <BrandMark size={40} />
        <span className={cn("truncate text-xl font-semibold tracking-tight text-foreground", !isSidebarOpen && !isDrawer && "lg:sr-only")}>
          Folio<span className="text-primary">-One</span>
        </span>
      </Link>

      <nav
        aria-label="Основная навигация"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-visible pb-2"
        onMouseLeave={() => onHoverNavIndex(null)}
      >
        {(isDrawer || isSidebarExpanded) ? (
          <div className="mb-1 flex items-center gap-2 px-1">
            {isReorderMode ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1"
                  onClick={() => {
                    onSetReorderMode(false);
                    onSetDragOverId(null);
                  }}
                >
                  Готово
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={onResetOrder}>
                  Сброс
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-full justify-start gap-2 px-2 text-muted-foreground"
                onClick={() => onSetReorderMode(true)}
              >
                <GripVertical aria-hidden="true" className="size-4" />
                Порядок меню
              </Button>
            )}
          </div>
        ) : null}
        {sidebarNavigation.map((item, index) => renderNavItem(item, index))}
      </nav>

      <div
        className={cn("mt-auto flex flex-col gap-2 border-t border-border pt-3", !isSidebarOpen && !isDrawer && "lg:items-center")}
        onMouseEnter={() => onHoverNavIndex(null)}
      >
        <Link
          href={ROUTES.settings}
          onClick={onNavClick}
          onFocus={() => onHoverNavIndex(null)}
          className={cn(
            "focus-ring relative flex min-h-12 items-center rounded-md border border-transparent text-left text-base font-medium transition hover:border-border hover:bg-muted hover:text-foreground",
            pathname === ROUTES.settings
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "text-muted-foreground",
            isSidebarOpen ? "gap-4 px-3" : "gap-3 px-3 lg:w-12 lg:justify-center lg:px-0",
          )}
          aria-current={pathname === ROUTES.settings ? "page" : undefined}
        >
          <Settings aria-hidden="true" className="size-5 shrink-0" />
          <span className={sidebarTextClass}>Настройки</span>
        </Link>

        <div
          className={cn(
            "flex min-h-12 items-center",
            isSidebarOpen ? "justify-between gap-2 px-3" : "justify-center lg:px-0",
          )}
        >
          {isSidebarOpen ? <span className="text-sm text-muted-foreground">Тема</span> : null}
          <ThemeToggle compact className={cn(!isSidebarOpen && !isDrawer && "lg:size-12")} />
        </div>

        <div
          className={cn(
            "relative flex min-h-12 items-center rounded-md border border-border bg-background",
            isSidebarOpen ? "gap-3 px-3" : "gap-3 px-3 lg:w-12 lg:justify-center lg:border-transparent lg:bg-transparent lg:px-0",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/25 text-sm font-semibold text-foreground">
            {userInitials}
          </span>
          <div className={cn("min-w-0 flex-1", !isSidebarOpen && !isDrawer && "lg:sr-only")}>
            <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
            {userEmail ? <div className="truncate text-xs text-muted-foreground">{userEmail}</div> : null}
          </div>
          {isSidebarOpen ? (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Выйти"
              onFocus={() => onHoverNavIndex(null)}
              className="focus-ring flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        {!isDrawer ? (
          <button
            type="button"
            aria-label={isSidebarExpanded ? "Свернуть боковое меню" : "Развернуть боковое меню"}
            aria-expanded={isSidebarExpanded}
            onClick={onToggleSidebar}
            onFocus={() => onHoverNavIndex(null)}
            className={cn(
              "focus-ring relative flex min-h-10 cursor-pointer items-center rounded-md border border-transparent text-sm font-medium text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground",
              isSidebarOpen ? "justify-center gap-2 px-3" : "justify-center gap-2 px-3 lg:w-12 lg:px-0",
            )}
          >
            {isSidebarExpanded ? <ChevronsLeft aria-hidden="true" className="size-5" /> : <ChevronsRight aria-hidden="true" className="size-5" />}
            <span className={cn("truncate", !isSidebarOpen && "lg:sr-only")}>
              {isSidebarExpanded ? "Свернуть" : "Развернуть"}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
