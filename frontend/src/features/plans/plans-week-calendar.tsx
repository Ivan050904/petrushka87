"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WeekTimeGrid, type WeekTimeGridHandle } from "@/features/plans/week-time-grid";
import {
  type AgendaItem,
  buildAgendaItems,
  formatMonthLabel,
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
    <div className={cn("flex min-h-0 flex-col gap-3 max-xl:gap-0", className)}>
      <div className="relative z-20 hidden shrink-0 flex-wrap items-center justify-between gap-3 xl:flex">
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

      <div className="relative z-20 flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5 xl:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setWeekStart((current) => addDays(current, -7))}
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="truncate text-xs font-medium tabular-nums">{formatWeekRangeLabel(weekStart)}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setWeekStart((current) => addDays(current, 7))}
            aria-label="Следующая неделя"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0 px-2.5 text-xs" onClick={goToToday}>
          Сегодня
        </Button>
      </div>

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
  );
}
