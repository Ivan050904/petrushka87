"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlarmClock,
  ArrowRight,
  CalendarRange,
  CheckSquare,
  CircleCheck,
  Gift,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Notice } from "@/components/ui/notice";
import { CaptureDock } from "@/features/capture/capture-dock";
import { AssistantPanel } from "@/features/assistant/assistant-panel";
import { DashboardWidgets } from "@/features/dashboard/dashboard-widgets";
import { TimeRail } from "@/features/dashboard/time-rail";
import { filterInboxEntries } from "@/features/inbox/inbox-helpers";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import {
  type AgendaItem,
  type AgendaKind,
  type DaySection,
  DAY_SECTION_LABELS,
  agendaLabel,
  buildAgendaItems,
  formatAgendaTimeRange,
  groupAgendaForDashboard,
  isSameDay,
} from "@/lib/agenda";
import { formatDateKey, habitMetadataPayload, readHabitMetadata, setHabitLog } from "@/lib/habits";
import { plansHref } from "@/lib/navigation";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY_SECTIONS: DaySection[] = ["now", "laterToday", "tomorrow"];
const HABITS_PREVIEW_LIMIT = 6;

export default function DashboardPage() {
  const { token, user } = useRequireAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [updatingHabitId, setUpdatingHabitId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listEntries(token, { limit: 100 });
      setEntries(result.items);
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить обзор."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const agendaItems = useMemo(() => buildAgendaItems(entries), [entries]);
  const agendaGroups = useMemo(() => groupAgendaForDashboard(agendaItems), [agendaItems]);
  const hasAgendaItems = useMemo(
    () => DAY_SECTIONS.some((section) => agendaGroups[section].length > 0),
    [agendaGroups],
  );

  const activeHabits = useMemo(
    () => entries.filter((entry) => entry.type === "habit" && readHabitMetadata(entry).stage !== "archived"),
    [entries],
  );
  const habitsPreview = useMemo(() => activeHabits.slice(0, HABITS_PREVIEW_LIMIT), [activeHabits]);
  const inboxEntries = useMemo(() => filterInboxEntries(entries), [entries]);

  const todayKey = formatDateKey(new Date());
  const dayTitle = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    [],
  );

  async function completeTask(entry: Entry) {
    if (!token || completingTaskId) {
      return;
    }
    setCompletingTaskId(entry.id);
    setActionError(null);
    try {
      const updated = await updateEntry(token, entry.id, {
        metadata: { ...entry.metadata, status: "done" },
      });
      setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось закрыть задачу."));
    } finally {
      setCompletingTaskId(null);
    }
  }

  async function toggleHabit(habit: Entry) {
    if (!token || updatingHabitId) {
      return;
    }
    const metadata = readHabitMetadata(habit);
    const nextStatus = metadata.logs[todayKey] === "done" ? null : "done";
    setUpdatingHabitId(habit.id);
    setActionError(null);
    try {
      const updated = await updateEntry(token, habit.id, {
        metadata: habitMetadataPayload(setHabitLog(metadata, todayKey, nextStatus)),
      });
      setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось отметить привычку."));
    } finally {
      setUpdatingHabitId(null);
    }
  }

  return (
    <AppShell>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {loadError ? (
          <div className="shrink-0">
            <Notice variant="error">{loadError}</Notice>
          </div>
        ) : null}
        {actionError ? (
          <div className="shrink-0">
            <Notice variant="error">{actionError}</Notice>
          </div>
        ) : null}

        <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(220px,26%)] lg:items-stretch lg:gap-5">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <header className="mb-3 flex shrink-0 flex-wrap items-baseline gap-2.5 lg:mb-4">
              <h1 className="text-2xl font-semibold capitalize leading-tight lg:text-3xl">{dayTitle}</h1>
              <Badge variant="default" className="rounded-full px-3 py-0.5 text-sm font-semibold">
                Сегодня
              </Badge>
            </header>

            <div className="scrollbar-hidden min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
              {isLoading ? (
                <LoadingFeed />
              ) : !hasAgendaItems ? (
                <Empty
                  title="На этот день задач нет. Добавьте задачу с временем, например «Встреча 15:00»"
                  actionHref={plansHref()}
                  actionLabel="Открыть планы"
                />
              ) : (
                <div className="flex flex-col gap-5 lg:gap-4">
                  {DAY_SECTIONS.map((section) => {
                    const items = agendaGroups[section];
                    if (items.length === 0) {
                      return null;
                    }
                    return (
                      <DaySectionBlock key={section} section={section} itemCount={items.length}>
                        {items.map((item) => (
                          <AgendaRow
                            key={item.id}
                            item={item}
                            emphasized={section === "now"}
                            isCompleting={completingTaskId === item.entry?.id}
                            onComplete={
                              item.entry?.type === "task" ? () => void completeTask(item.entry as Entry) : undefined
                            }
                          />
                        ))}
                      </DaySectionBlock>
                    );
                  })}
                </div>
              )}

              {!isLoading && hasAgendaItems ? (
                <div className="mt-3">
                  <Button asChild variant="ghost" size="sm" className="h-9 px-2 text-sm text-muted-foreground">
                    <Link href={plansHref()}>
                      Все планы
                      <ArrowRight data-icon="inline-end" className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>

            <DashboardWidgets
              entries={entries}
              habits={habitsPreview}
              inboxEntries={inboxEntries}
              userId={user?.id}
              updatingHabitId={updatingHabitId}
              onToggleHabit={(habit) => void toggleHabit(habit)}
            />
          </div>

          <TimeRail items={agendaItems} className="hidden min-h-0 min-w-0 lg:flex" />
        </div>

        <div className="grid min-h-0 min-w-0 shrink-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,34%)]">
          <CaptureDock token={token} onSaved={loadEntries} className="min-w-0" />
          <AssistantPanel token={token} onChanged={loadEntries} className="min-w-0 min-h-[280px]" />
        </div>
      </div>
    </AppShell>
  );
}

function DaySectionBlock({
  section,
  itemCount,
  children,
}: {
  section: DaySection;
  itemCount: number;
  children: ReactNode;
}) {
  const isNow = section === "now";

  return (
    <section className={cn(isNow && "border-l-[3px] border-primary pl-4")} aria-labelledby={`day-section-${section}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <h2
          id={`day-section-${section}`}
          className={cn(
            "font-semibold",
            isNow ? "text-base text-foreground lg:text-lg" : "text-sm uppercase tracking-wide text-muted-foreground",
          )}
        >
          {DAY_SECTION_LABELS[section]}
        </h2>
        <Badge variant="secondary" className="h-6 px-2 text-xs">
          {itemCount}
        </Badge>
      </div>
      <div className="divide-y divide-border/80">{children}</div>
    </section>
  );
}

function AgendaRow({
  item,
  emphasized,
  isCompleting,
  onComplete,
}: {
  item: AgendaItem;
  emphasized?: boolean;
  isCompleting: boolean;
  onComplete?: () => void;
}) {
  const Icon = agendaIcon(item.kind);
  const isToday = isSameDay(item.date, new Date());

  return (
    <div
      className={cn(
        "grid min-h-[52px] grid-cols-[40px_minmax(0,1fr)_80px] items-center gap-3 py-2.5 transition-colors hover:bg-muted/30 lg:min-h-[56px] lg:py-3",
        emphasized && "min-h-[56px] lg:min-h-[60px]",
      )}
    >
      {item.kind === "task" && onComplete ? (
        <button
          type="button"
          aria-label="Завершить задачу"
          onClick={onComplete}
          disabled={isCompleting}
          className="focus-ring flex size-10 cursor-pointer items-center justify-center rounded-md border border-input/80 bg-card transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CircleCheck aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-md",
            emphasized ? "bg-primary/10 text-primary" : "bg-muted/70 text-primary",
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </span>
      )}
      <Link href={item.href} className="focus-ring min-w-0">
        <span className={cn("block truncate font-medium", emphasized ? "text-base lg:text-lg" : "text-base")}>
          {item.title}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{agendaLabel(item.kind)}</span>
      </Link>
      <div className={cn("text-right text-sm text-muted-foreground", emphasized && "font-medium tabular-nums")}>
        {formatAgendaTimeRange(item.date, item.endDate, isToday ? item.date : new Date())}
      </div>
    </div>
  );
}

function LoadingFeed() {
  return (
    <div className="flex flex-col gap-6" aria-label="Загрузка">
      <div className="border-l-[3px] border-primary/30 pl-4">
        <div className="mb-3 h-4 w-20 rounded bg-muted/60" />
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="mb-2 h-[52px] rounded-md bg-muted/40" />
        ))}
      </div>
      <div>
        <div className="mb-3 h-3 w-28 rounded bg-muted/50" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="mb-2 h-[52px] rounded-md bg-muted/30" />
        ))}
      </div>
    </div>
  );
}

function agendaIcon(kind: AgendaKind) {
  if (kind === "task") {
    return CheckSquare;
  }
  if (kind === "event") {
    return CalendarRange;
  }
  if (kind === "birthday") {
    return Gift;
  }
  return AlarmClock;
}
