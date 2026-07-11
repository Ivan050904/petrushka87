"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import {
  type AgendaItem,
  agendaBlockClass,
  agendaDotClass,
  agendaTimeOffset,
  AGENDA_HOUR_HEIGHT,
  AGENDA_MIN_BLOCK_HEIGHT,
  buildWeekDays,
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  durationToAgendaHeight,
  formatAgendaTimeRange,
  formatWeekday,
  isSameDay,
} from "@/lib/agenda";
import { cn } from "@/lib/utils";

const GRID_START_HOUR = CALENDAR_GRID_START_HOUR;
const GRID_END_HOUR = CALENDAR_GRID_END_HOUR;
const GRID_HOURS = GRID_END_HOUR - GRID_START_HOUR;
const TRACK_PADDING_TOP = 8;
const TIME_GUTTER = 52;
const DAY_HEADER_HEIGHT = 52;
const TRACK_HEIGHT = GRID_HOURS * AGENDA_HOUR_HEIGHT;
const TOTAL_GRID_HEIGHT = TRACK_PADDING_TOP + TRACK_HEIGHT + 8;
const MIN_GRID_VIEWPORT_HEIGHT = 520;

export type WeekTimeGridHandle = {
  scrollToCurrentTime: () => void;
};

type WeekTimeGridProps = {
  items: AgendaItem[];
  weekStart: Date;
  selectedDay: Date | null;
  selectedItemId: string | null;
  onSelectDay: (day: Date) => void;
  onSelectItem: (item: AgendaItem) => void;
  onSlotClick?: (day: Date, start: Date, end: Date) => void;
  scrollToTodayToken?: number;
};

export const WeekTimeGrid = forwardRef<WeekTimeGridHandle, WeekTimeGridProps>(function WeekTimeGrid(
  {
    items,
    weekStart,
    selectedDay,
    selectedItemId,
    onSelectDay,
    onSelectItem,
    onSlotClick,
    scrollToTodayToken = 0,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);
  const weekDays = useMemo(() => buildWeekDays(weekStart, items), [weekStart, items]);
  const hours = useMemo(
    () => Array.from({ length: GRID_HOURS + 1 }, (_, index) => GRID_START_HOUR + index),
    [],
  );

  const nowTop = agendaTimeOffset(new Date(), TRACK_PADDING_TOP, AGENDA_HOUR_HEIGHT) - GRID_START_HOUR * AGENDA_HOUR_HEIGHT;

  const scrollToCurrentTime = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }
    const targetTop = Math.max(0, nowTop - scrollEl.clientHeight * 0.25);
    scrollEl.scrollTop = targetTop;
  }, [nowTop]);

  useImperativeHandle(ref, () => ({ scrollToCurrentTime }), [scrollToCurrentTime]);

  useEffect(() => {
    scrollToCurrentTime();
  }, [scrollToCurrentTime, weekStart]);

  useEffect(() => {
    if (scrollToTodayToken > 0) {
      scrollToCurrentTime();
    }
  }, [scrollToTodayToken, scrollToCurrentTime]);

  return (
    <div className="flex min-h-[600px] flex-1 flex-col overflow-hidden rounded-md border border-border bg-card shadow-panel">
      <div className="flex shrink-0 border-b border-border bg-muted/30">
        <div className="shrink-0 border-r border-border/70 bg-card" style={{ width: TIME_GUTTER, height: DAY_HEADER_HEIGHT }} />
        <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {weekDays.map((day) => {
            const isToday = isSameDay(day.date, today);
            const isSelected = selectedDay ? isSameDay(day.date, selectedDay) : false;
            return (
              <button
                key={day.key}
                type="button"
                onClick={() => onSelectDay(day.date)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 border-l border-border/60 px-1 py-2 text-center transition",
                  isToday && "bg-primary/10",
                  isSelected && "bg-primary/15 ring-1 ring-inset ring-primary/30",
                )}
              >
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{formatWeekday(day.date)}</span>
                <span className={cn("text-lg font-semibold tabular-nums", isToday && "text-primary")}>{day.date.getDate()}</span>
                {day.items.length > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{day.items.length}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-subtle min-h-0 flex-1 overflow-auto"
        style={{ minHeight: MIN_GRID_VIEWPORT_HEIGHT }}
      >
        <div className="flex" style={{ minHeight: TOTAL_GRID_HEIGHT }}>
          <div
            className="sticky left-0 z-20 shrink-0 border-r border-border bg-card"
            style={{ width: TIME_GUTTER, minHeight: TOTAL_GRID_HEIGHT }}
          >
            <div className="relative" style={{ height: TOTAL_GRID_HEIGHT }}>
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="absolute right-2 text-right text-xs font-medium tabular-nums text-foreground/80"
                  style={{ top: hourTop(hour) - 8 }}
                >
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 flex-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", minHeight: TOTAL_GRID_HEIGHT }}>
            {weekDays.map((day) => {
              const isToday = isSameDay(day.date, today);
              return (
                <div
                  key={day.key}
                  role={onSlotClick ? "button" : undefined}
                  tabIndex={onSlotClick ? 0 : undefined}
                  onClick={
                    onSlotClick
                      ? (event) => {
                          const slot = slotFromOffsetY(day.date, event.nativeEvent.offsetY);
                          if (!slot) {
                            return;
                          }
                          onSelectDay(day.date);
                          onSlotClick(day.date, slot.start, slot.end);
                        }
                      : undefined
                  }
                  onKeyDown={
                    onSlotClick
                      ? (event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          const slot = slotFromOffsetY(day.date, TRACK_PADDING_TOP + AGENDA_HOUR_HEIGHT * 2);
                          if (!slot) {
                            return;
                          }
                          onSelectDay(day.date);
                          onSlotClick(day.date, slot.start, slot.end);
                        }
                      : undefined
                  }
                  className={cn(
                    "relative border-l border-border/50",
                    isToday && "bg-primary/[0.04]",
                    onSlotClick && "cursor-cell",
                  )}
                  style={{ minHeight: TOTAL_GRID_HEIGHT }}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="pointer-events-none absolute right-0 left-0 border-t border-border/50"
                      style={{ top: hourTop(hour) }}
                    />
                  ))}

                  {isToday && nowTop >= 0 && nowTop <= TRACK_HEIGHT ? (
                    <div
                      className="pointer-events-none absolute right-0 left-0 z-20 border-t-2 border-destructive"
                      style={{ top: nowTop }}
                    />
                  ) : null}

                  {day.items.map((item) => {
                    const top = itemTop(item.date);
                    if (top < 0 || top > TRACK_HEIGHT) {
                      return null;
                    }
                    const hasRange = Boolean(item.endDate && item.endDate.getTime() > item.date.getTime());
                    const height = hasRange
                      ? durationToAgendaHeight(item.date, item.endDate!, AGENDA_HOUR_HEIGHT, AGENDA_MIN_BLOCK_HEIGHT)
                      : AGENDA_MIN_BLOCK_HEIGHT;
                    const clippedHeight = Math.min(height, Math.max(AGENDA_MIN_BLOCK_HEIGHT, TRACK_HEIGHT - top + 4));

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectItem(item);
                        }}
                        className={cn(
                          "absolute right-0.5 left-0.5 z-10 overflow-hidden rounded border px-1.5 py-1 text-left shadow-sm transition hover:brightness-95",
                          agendaBlockClass(item.kind),
                          item.skipped && "opacity-50 line-through",
                          selectedItemId === item.id && "ring-2 ring-primary/60",
                        )}
                        style={{ top, height: clippedHeight, minHeight: AGENDA_MIN_BLOCK_HEIGHT }}
                        title={item.title}
                      >
                        <div className="flex items-start gap-1">
                          <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", agendaDotClass(item.kind))} />
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-medium leading-4">{item.title}</p>
                            {clippedHeight >= 36 ? (
                              <p className="truncate text-[10px] text-muted-foreground">
                                {formatAgendaTimeRange(item.date, item.endDate, day.date)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

function hourTop(hour: number) {
  return TRACK_PADDING_TOP + (hour - GRID_START_HOUR) * AGENDA_HOUR_HEIGHT;
}

function itemTop(date: Date) {
  const absolute = agendaTimeOffset(date, TRACK_PADDING_TOP, AGENDA_HOUR_HEIGHT);
  return absolute - GRID_START_HOUR * AGENDA_HOUR_HEIGHT;
}

function slotFromOffsetY(day: Date, offsetY: number) {
  const minutesFromGridStart = ((offsetY - TRACK_PADDING_TOP) / AGENDA_HOUR_HEIGHT) * 60;
  const snappedMinutes = Math.round(minutesFromGridStart / 30) * 30;
  const clampedMinutes = Math.max(0, Math.min(GRID_HOURS * 60 - 30, snappedMinutes));
  const totalMinutes = GRID_START_HOUR * 60 + clampedMinutes;
  const start = new Date(day);
  start.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 60);
  return { start, end };
}
