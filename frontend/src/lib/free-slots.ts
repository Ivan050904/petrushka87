import { type AgendaItem, isSameDay, startOfDay } from "@/lib/agenda";

export type FreeSlot = {
  start: Date;
  end: Date;
  minutes: number;
};

const timeFormatter = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function computeFreeSlots(
  items: AgendaItem[],
  day: Date,
  workStartHour = 0,
  workEndHour = 24,
): FreeSlot[] {
  const dayStart = startOfDay(day);
  const windowStart = new Date(dayStart);
  windowStart.setHours(workStartHour, 0, 0, 0);
  const windowEnd = new Date(dayStart);
  windowEnd.setHours(workEndHour, 0, 0, 0);

  const busy = items
    .filter((item) => isSameDay(item.date, day))
    .map((item) => ({
      start: item.date,
      end: item.endDate && item.endDate.getTime() > item.date.getTime() ? item.endDate : addMinutes(item.date, 30),
    }))
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const slots: FreeSlot[] = [];
  let cursor = windowStart;

  for (const block of busy) {
    const blockStart = block.start < windowStart ? windowStart : block.start;
    const blockEnd = block.end > windowEnd ? windowEnd : block.end;
    if (blockStart > cursor && blockStart <= windowEnd) {
      slots.push(makeSlot(cursor, blockStart));
    }
    if (blockEnd > cursor) {
      cursor = blockEnd;
    }
  }

  if (cursor < windowEnd) {
    slots.push(makeSlot(cursor, windowEnd));
  }

  return slots.filter((slot) => slot.minutes >= 15);
}

function makeSlot(start: Date, end: Date): FreeSlot {
  return {
    start,
    end,
    minutes: Math.round((end.getTime() - start.getTime()) / 60_000),
  };
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

export function formatFreeSlot(slot: FreeSlot) {
  return `${timeFormatter.format(slot.start)} – ${timeFormatter.format(slot.end)}`;
}
