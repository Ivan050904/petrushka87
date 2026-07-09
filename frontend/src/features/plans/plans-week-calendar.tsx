"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Repeat } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import {
  type AgendaItem,
  agendaDotClass,
  agendaLabel,
  buildAgendaItems,
  buildWeekDays,
  formatAgendaDateTime,
  formatWeekday,
  isSameDay,
  startOfDay,
} from "@/lib/agenda";
import { addDays, getWeekMonday, readTaskRecurrence, recurrenceRuleLabel } from "@/lib/recurrence";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type PlansWeekCalendarProps = {
  entries: Entry[];
  selectedId: string | null;
  onSelect: (item: AgendaItem) => void;
  className?: string;
};

function getWeekRange(reference: Date) {
  const start = getWeekMonday(reference);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatWeekRangeLabel(reference: Date) {
  const { start, end } = getWeekRange(reference);
  const formatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const year = end.getFullYear();
  return `${formatter.format(start)} — ${formatter.format(end)}, ${year}`;
}

export function PlansWeekCalendar({ entries, selectedId, onSelect, className }: PlansWeekCalendarProps) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfDay(new Date()));

  const weekRange = useMemo(() => getWeekRange(weekAnchor), [weekAnchor]);
  const agendaItems = useMemo(
    () =>
      buildAgendaItems(entries, {
        rangeStart: weekRange.start,
        rangeEnd: weekRange.end,
      }),
    [entries, weekRange.end, weekRange.start],
  );
  const weekDays = useMemo(() => buildWeekDays(weekAnchor, agendaItems), [weekAnchor, agendaItems]);
  const today = startOfDay(new Date());

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-panel",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarDays className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Недельный календарь</h2>
            <p className="text-xs text-muted-foreground">{formatWeekRangeLabel(weekAnchor)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchor((current) => addDays(current, -7))}
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft data-icon="inline-start" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setWeekAnchor(startOfDay(new Date()))}>
            Сегодня
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekAnchor((current) => addDays(current, 7))}
            aria-label="Следующая неделя"
          >
            <ChevronRight data-icon="inline-start" />
          </Button>
        </div>
      </div>

      <div className="scrollbar-hidden min-h-0 flex-1 overflow-auto p-4">
        <div className="grid min-w-[980px] gap-3 lg:grid-cols-7">
        {weekDays.map((day) => {
          const isToday = isSameDay(day.date, today);
          return (
            <section
              key={day.key}
              className={cn(
                "flex min-h-[240px] flex-col rounded-xl border p-3 transition",
                isToday ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border bg-muted/15",
              )}
            >
              <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {formatWeekday(day.date)}
                  </p>
                  <p className={cn("text-lg font-semibold", isToday && "text-primary")}>{day.date.getDate()}</p>
                </div>
                {day.items.length > 0 ? (
                  <Badge variant="secondary">{day.items.length}</Badge>
                ) : null}
              </header>

              <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto">
                <div className="flex flex-col gap-2 pr-1">
                {day.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Пусто</p>
                ) : (
                  day.items.map((item) => (
                    <CalendarItemCard
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      onSelect={() => onSelect(item)}
                    />
                  ))
                )}
                </div>
              </div>
            </section>
          );
        })}
        </div>
      </div>

      {agendaItems.length === 0 ? (
        <div className="border-t border-border p-6">
          <Empty title="На этой неделе планов нет. Создай задачу с еженедельным повторением или запланируй событие." />
        </div>
      ) : null}
    </div>
  );
}

function CalendarItemCard({
  item,
  selected,
  onSelect,
}: {
  item: AgendaItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const recurrence = item.entry ? readTaskRecurrence(item.entry.metadata) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "focus-ring rounded-lg border px-3 py-2 text-left transition",
        selected ? "border-primary/50 bg-primary/10" : "border-border/80 bg-card hover:bg-muted/60",
        item.skipped && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", agendaDotClass(item.kind))} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-medium", item.skipped && "line-through")}>
            {item.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{formatAgendaDateTime(item.date)}</span>
            <span>·</span>
            <span>{agendaLabel(item.kind)}</span>
          </span>
          {item.recurring && recurrence ? (
            <span className="mt-1 flex items-center gap-1 text-[11px] text-secondary-foreground">
              <Repeat className="size-3" aria-hidden="true" />
              {recurrenceRuleLabel(recurrence)}
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}
