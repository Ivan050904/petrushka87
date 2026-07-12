"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CircleCheck, Circle as CircleIcon, Inbox } from "lucide-react";
import Link from "next/link";

import { NutritionArcChart } from "@/components/nutrition-arc-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BirthdaysWidget } from "@/features/dashboard/birthdays-widget";
import { FinanceMonthWidget } from "@/features/dashboard/finance-month-widget";
import { inboxPreviewTitle } from "@/features/inbox/inbox-helpers";
import { entryModuleHref } from "@/lib/entry-helpers";
import {
  DEFAULT_NUTRITION_TARGETS,
  foodTargetsStorageKey,
  parseNutritionTargets,
  type NutritionTargets,
} from "@/lib/food-tracking";
import { formatDateKey, readHabitMetadata } from "@/lib/habits";
import type { FinanceSummary } from "@/lib/finance-import";
import { formatEntryType } from "@/lib/labels";
import { buildNutritionSummary } from "@/lib/nutrition-summary";
import { ROUTES, trackingFinanceDashboardHref } from "@/lib/navigation";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type DashboardWidgetsProps = {
  entries: Entry[];
  habits: Entry[];
  inboxEntries: Entry[];
  userId: string | undefined;
  updatingHabitId: string | null;
  onToggleHabit: (habit: Entry) => void;
  financeSummary: FinanceSummary | null;
  financeCompareSummary: FinanceSummary | null;
  financeCompareMonth: string;
  isFinanceLoading: boolean;
};

export function DashboardWidgets({
  entries,
  habits,
  inboxEntries,
  userId,
  updatingHabitId,
  onToggleHabit,
  financeSummary,
  financeCompareSummary,
  financeCompareMonth,
  isFinanceLoading,
}: DashboardWidgetsProps) {
  const todayKey = formatDateKey(new Date());
  const [targets, setTargets] = useState<NutritionTargets>(DEFAULT_NUTRITION_TARGETS);
  const nutrition = buildNutritionSummary(entries);
  const inboxPreview = inboxEntries.slice(0, 3);
  const people = entries.filter((entry) => entry.type === "person");

  useEffect(() => {
    if (!userId) {
      setTargets(DEFAULT_NUTRITION_TARGETS);
      return;
    }
    try {
      setTargets(parseNutritionTargets(window.localStorage.getItem(foodTargetsStorageKey(userId))));
    } catch {
      setTargets(DEFAULT_NUTRITION_TARGETS);
    }
  }, [userId]);

  return (
    <section
      className="grid min-w-0 shrink-0 gap-3 border-t border-border/70 pt-4 sm:grid-cols-2 lg:gap-4 lg:pt-4 xl:grid-cols-5"
      aria-label="Виджеты дня"
    >
      <WidgetBlock title="Привычки" actionHref={`${ROUTES.tracking}?tab=habits`} actionLabel="Все">
        {habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Привычек пока нет</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {habits.map((habit) => {
              const done = readHabitMetadata(habit).logs[todayKey] === "done";
              return (
                <button
                  key={habit.id}
                  type="button"
                  onClick={() => onToggleHabit(habit)}
                  disabled={updatingHabitId === habit.id}
                  aria-pressed={done}
                  aria-label={`Отметить привычку ${habit.title}`}
                  className="focus-ring inline-flex max-w-full items-center gap-2 rounded-full border border-border/80 bg-muted/20 px-3 py-1.5 text-sm transition hover:bg-muted/50 disabled:opacity-60"
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border",
                      done ? "border-accent bg-accent text-accent-foreground" : "border-input text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <CircleCheck aria-hidden="true" className="size-3" />
                    ) : (
                      <CircleIcon aria-hidden="true" className="size-3" />
                    )}
                  </span>
                  <span className="truncate">{habit.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </WidgetBlock>

      <WidgetBlock title="Входящие" actionHref={ROUTES.inbox} actionLabel="Разобрать">
        <div className="mb-1.5 flex items-center gap-2">
          <Inbox aria-hidden="true" className="size-4 text-primary" />
          {inboxEntries.length > 0 ? (
            <Badge variant="secondary" className="h-6 px-2 text-xs">
              {inboxEntries.length}
            </Badge>
          ) : null}
        </div>
        {inboxPreview.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нечего разбирать</p>
        ) : (
          <ul className="space-y-1.5">
            {inboxPreview.map((entry) => (
              <li key={entry.id} className="min-w-0">
                <Link
                  href={entryModuleHref(entry)}
                  className="focus-ring block truncate text-sm font-medium transition hover:text-primary"
                >
                  {inboxPreviewTitle(entry)}
                </Link>
                <span className="text-xs text-muted-foreground">{formatEntryType(entry.type)}</span>
              </li>
            ))}
          </ul>
        )}
      </WidgetBlock>

      <WidgetBlock title="КБЖУ сегодня" actionHref={`${ROUTES.tracking}?tab=food`} actionLabel="Трекинг">
        <NutritionArcChart summary={nutrition} targets={targets} compact />
      </WidgetBlock>

      <WidgetBlock title="Финансы" actionHref={trackingFinanceDashboardHref()} actionLabel="Дашборд">
        <FinanceMonthWidget
          summary={financeSummary}
          compareSummary={financeCompareSummary}
          compareMonth={financeCompareMonth}
          isLoading={isFinanceLoading}
        />
      </WidgetBlock>

      <BirthdaysWidget people={people} />
    </section>
  );
}

function WidgetBlock({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-card/40 p-3 lg:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-sm">
          <Link href={actionHref}>
            {actionLabel}
            <ArrowRight data-icon="inline-end" className="size-3.5" />
          </Link>
        </Button>
      </div>
      {children}
    </div>
  );
}
