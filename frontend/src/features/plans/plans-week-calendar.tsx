"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeekTimeGrid, type WeekTimeGridHandle } from "@/features/plans/week-time-grid";
import {
  type AgendaItem,
  buildAgendaItems,
  formatAgendaTimeRange,
  formatMonthLabel,
  isSameDay,
  startOfDay,
} from "@/lib/agenda";
import { addDays, getWeekMonday } from "@/lib/recurrence";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type PlansWeekCalendarProps = {
  entries: Entry[];
  selectedId: string | null;
  selectedDay: Date | null;
  onSelect: (item: AgendaItem) => void;
  onSelectDay: (day: Date) => void;
  onSlotClick?: (day: Date, start: Date, end: Date) => void;
  className?: string;
};

function formatWeekRangeLabel(weekStart: Date) {
  const end = addDays(weekStart, 6);
  const startMonth = formatMonthLabel(weekStart);
  const endMonth = formatMonthLabel(end);
  if (startMonth === endMonth) {
    return `${weekStart.getDate()}–${end.getDate()} ${startMonth}`;
  }
  return `${weekStart.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
}

export function PlansWeekCalendar({
  entries,
  selectedId,
  selectedDay,
  onSelect,
  onSelectDay,
  onSlotClick,
  className,
}: PlansWeekCalendarProps) {
  const gridRef = useRef<WeekTimeGridHandle>(null);
  const [weekStart, setWeekStart] = useState(() => getWeekMonday(startOfDay(new Date())));
  const [scrollToTodayToken, setScrollToTodayToken] = useState(0);

  const weekRange = useMemo(() => {
    const start = weekStart;
    const end = addDays(start, 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [weekStart]);

  const agendaItems = useMemo(
    () =>
      buildAgendaItems(entries, {
        rangeStart: weekRange.start,
        rangeEnd: weekRange.end,
      }),
    [entries, weekRange.end, weekRange.start],
  );

  const activeDay = selectedDay ?? startOfDay(new Date());
  const dayItems = useMemo(
    () =>
      agendaItems
        .filter((item) => isSameDay(item.date, activeDay))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [agendaItems, activeDay],
  );

  function shiftActiveDay(delta: number) {
    const next = addDays(activeDay, delta);
    onSelectDay(next);
    setWeekStart(getWeekMonday(next));
  }

  function goToToday() {
    const today = startOfDay(new Date());
    setWeekStart(getWeekMonday(today));
    onSelectDay(today);
    setScrollToTodayToken((value) => value + 1);
    window.requestAnimationFrame(() => {
      gridRef.current?.scrollToCurrentTime();
    });
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-3 lg:min-h-[640px]", className)}>
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarDays className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Недельный календарь</h2>
            <p className="text-xs text-muted-foreground">{formatWeekRangeLabel(weekStart)}</p>
          </div>
        </div>
        <div className="relative z-20 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((current) => addDays(current, -7))}
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={goToToday}>
            Сегодня
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((current) => addDays(current, 7))}
            aria-label="Следующая неделя"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="icon" className="size-10" onClick={() => shiftActiveDay(-1)} aria-label="Предыдущий день">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-semibold capitalize">
              {new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(activeDay)}
            </p>
          </div>
          <Button type="button" variant="outline" size="icon" className="size-10" onClick={() => shiftActiveDay(1)} aria-label="Следующий день">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {dayItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            На этот день событий нет
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {dayItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className={cn(
                  "focus-ring rounded-md border px-3 py-3 text-left transition",
                  selectedId === item.id ? "border-primary/40 bg-primary/10" : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <div className="text-xs text-muted-foreground">{formatAgendaTimeRange(item.date, item.endDate, activeDay)}</div>
                <div className="mt-1 text-sm font-medium">{item.title}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hidden min-h-0 flex-1 lg:flex">
        <WeekTimeGrid
          ref={gridRef}
          items={agendaItems}
          weekStart={weekStart}
          selectedDay={selectedDay}
          selectedItemId={selectedId}
          onSelectDay={onSelectDay}
          onSelectItem={onSelect}
          onSlotClick={onSlotClick}
          scrollToTodayToken={scrollToTodayToken}
        />
      </div>
    </div>
  );
}
