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
    <div className={cn("flex min-h-[640px] flex-col gap-3", className)}>
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

      <WeekTimeGrid
        ref={gridRef}
        items={agendaItems}
        weekStart={weekStart}
        selectedDay={selectedDay}
        selectedItemId={selectedId}
        onSelectDay={onSelectDay}
        onSelectItem={onSelect}
        scrollToTodayToken={scrollToTodayToken}
      />
    </div>
  );
}
