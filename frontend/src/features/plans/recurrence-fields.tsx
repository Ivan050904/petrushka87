"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  WEEKDAYS,
  toggleWeekdaySelection,
  weekdayShortLabel,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";

type RecurrenceFieldsProps = {
  enabled: boolean;
  weekdays: number[];
  time: string;
  onEnabledChange: (enabled: boolean) => void;
  onWeekdaysChange: (weekdays: number[]) => void;
  onTimeChange: (time: string) => void;
};

export function RecurrenceFields({
  enabled,
  weekdays,
  time,
  onEnabledChange,
  onWeekdaysChange,
  onTimeChange,
}: RecurrenceFieldsProps) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="size-4 rounded border-border"
        />
        Еженедельное повторение
      </label>

      {enabled ? (
        <div className="mt-4 grid gap-4">
          <Field>
            <FieldLabel>Дни недели</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const selected = weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onWeekdaysChange(toggleWeekdaySelection(weekdays, day))}
                    className={cn(
                      "focus-ring min-h-10 rounded-md border px-3 text-sm font-medium transition",
                      selected ? "filter-pill-active" : "filter-pill-inactive",
                    )}
                  >
                    {weekdayShortLabel(day)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="task-recurrence-time">Время</FieldLabel>
            <Input
              id="task-recurrence-time"
              type="time"
              value={time}
              onChange={(event) => onTimeChange(event.target.value)}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
