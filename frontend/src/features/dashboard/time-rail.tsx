"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  type AgendaItem,
  agendaDotClass,
  agendaLabel,
  agendaTimeOffset,
  AGENDA_HOUR_HEIGHT,
  AGENDA_MIN_BLOCK_HEIGHT,
  durationToAgendaHeight,
  formatAgendaTimeRange,
  isSameDay,
} from "@/lib/agenda";
import { cn } from "@/lib/utils";

const RAIL_TOTAL_HOURS = 24;
const HOUR_HEIGHT = AGENDA_HOUR_HEIGHT;
const TRACK_HEIGHT = HOUR_HEIGHT * RAIL_TOTAL_HOURS;
const TRACK_PADDING_TOP = 14;
const TRACK_PADDING_BOTTOM = 10;
const TIME_GUTTER = 44;
const TOTAL_TRACK_HEIGHT = TRACK_PADDING_TOP + TRACK_HEIGHT + TRACK_PADDING_BOTTOM;

type TimeRailProps = {
  items: AgendaItem[];
  className?: string;
  day?: Date;
};

export function TimeRail({ items, className, day }: TimeRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const targetDay = day ?? new Date();

  const dayItems = useMemo(
    () =>
      items
        .filter((item) => isSameDay(item.date, targetDay))
        .sort((left, right) => left.date.getTime() - right.date.getTime()),
    [items, targetDay],
  );

  const hours = useMemo(() => Array.from({ length: RAIL_TOTAL_HOURS + 1 }, (_, index) => index), []);

  const now = new Date();
  const showNowMarker = isSameDay(targetDay, now);
  const nowTop = agendaTimeOffset(now, TRACK_PADDING_TOP, HOUR_HEIGHT);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      return;
    }
    const viewportHeight = scrollEl.clientHeight;
    if (viewportHeight <= 0) {
      return;
    }
    scrollEl.scrollTop = Math.max(0, nowTop - viewportHeight * 0.35);
  }, [nowTop]);

  return (
    <aside className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden", className)} aria-label="Лента времени">
      <div
        ref={scrollRef}
        className="scrollbar-subtle min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-md border border-border/70 bg-card/50"
      >
        <div className="relative" style={{ height: TOTAL_TRACK_HEIGHT }}>
          {hours.map((hour) => {
            const lineTop = hourTop(hour);
            return (
              <div key={hour} className="pointer-events-none absolute right-0" style={{ top: lineTop, left: TIME_GUTTER }}>
                <div className="border-t border-border/50" />
              </div>
            );
          })}

          {hours.map((hour) => (
            <span
              key={`label-${hour}`}
              className="pointer-events-none absolute left-1.5 w-9 bg-card/80 text-right text-xs tabular-nums leading-none text-muted-foreground"
              style={{ top: hourTop(hour) - 7 }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}

          {showNowMarker && nowTop >= TRACK_PADDING_TOP && nowTop <= TRACK_PADDING_TOP + TRACK_HEIGHT ? (
            <div
              className="pointer-events-none absolute right-0 z-20 flex items-center"
              style={{ top: nowTop, left: TIME_GUTTER - 6 }}
              aria-hidden="true"
            >
              <span className="size-2 -translate-y-1/2 rounded-full bg-destructive" />
              <span className="h-px flex-1 -translate-y-1/2 bg-destructive/70" />
            </div>
          ) : null}

          {dayItems.map((item) => {
            const top = agendaTimeOffset(item.date, TRACK_PADDING_TOP, HOUR_HEIGHT);
            if (top < TRACK_PADDING_TOP || top > TRACK_PADDING_TOP + TRACK_HEIGHT) {
              return null;
            }

            const hasRange = Boolean(item.endDate && item.endDate.getTime() > item.date.getTime());
            const blockHeight = hasRange
              ? durationToAgendaHeight(item.date, item.endDate!, HOUR_HEIGHT, AGENDA_MIN_BLOCK_HEIGHT)
              : AGENDA_MIN_BLOCK_HEIGHT;
            const trackBottom = TRACK_PADDING_TOP + TRACK_HEIGHT;
            const clippedHeight = Math.min(blockHeight, Math.max(AGENDA_MIN_BLOCK_HEIGHT, trackBottom - top + 2));

            return (
              <div
                key={item.id}
                className="absolute right-1.5 z-10 overflow-hidden rounded-md border border-border/70 bg-card px-2.5 py-1.5 shadow-sm"
                style={{
                  top: top - 2,
                  left: TIME_GUTTER + 4,
                  height: hasRange ? clippedHeight : undefined,
                  minHeight: AGENDA_MIN_BLOCK_HEIGHT,
                }}
                title={item.title}
              >
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", agendaDotClass(item.kind))} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-5">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {hasRange && clippedHeight >= 56
                        ? formatAgendaTimeRange(item.date, item.endDate)
                        : agendaLabel(item.kind)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function hourTop(hour: number) {
  return TRACK_PADDING_TOP + hour * HOUR_HEIGHT;
}
