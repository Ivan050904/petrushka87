"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { createEntry, getErrorMessage } from "@/lib/api";
import { computeDurationMinutes, startOfDay } from "@/lib/agenda";
import { cn } from "@/lib/utils";

type CreateKind = "task" | "event" | "meeting";

type CalendarCreateFormProps = {
  token: string | null;
  selectedDay: Date | null;
  draftSlot: { start: Date; end: Date } | null;
  onCreated: () => Promise<void>;
  onClearSelection?: () => void;
  onClearDraftSlot?: () => void;
};

const kindOptions: Array<{ value: CreateKind; label: string }> = [
  { value: "task", label: "Задача" },
  { value: "event", label: "Событие" },
  { value: "meeting", label: "Встреча" },
];

export function CalendarCreateForm({
  token,
  selectedDay,
  draftSlot,
  onCreated,
  onClearSelection,
  onClearDraftSlot,
}: CalendarCreateFormProps) {
  const [kind, setKind] = useState<CreateKind>("task");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [manualTimes, setManualTimes] = useState(false);

  useEffect(() => {
    if (draftSlot) {
      setStartsAt(toLocalInputFromDate(draftSlot.start));
      setEndsAt(toLocalInputFromDate(draftSlot.end));
      setManualTimes(true);
      return;
    }
    if (!manualTimes) {
      const defaults = defaultSlotTimes(selectedDay);
      setStartsAt(defaults.startsAt);
      setEndsAt(defaults.endsAt);
    }
  }, [draftSlot, selectedDay, manualTimes]);

  function handleStartsAtChange(value: string) {
    setManualTimes(true);
    setStartsAt(value);
    if (value && endsAt && endsAt <= value) {
      const startDate = parseLocalInput(value);
      if (startDate) {
        const endDate = new Date(startDate);
        endDate.setHours(endDate.getHours() + 1);
        setEndsAt(toLocalInputFromDate(endDate));
      }
    }
  }

  function resetForm() {
    setTitle("");
    setLocation("");
    setError(null);
    setManualTimes(false);
    onClearDraftSlot?.();
    const defaults = defaultSlotTimes(selectedDay);
    setStartsAt(defaults.startsAt);
    setEndsAt(defaults.endsAt);
  }

  async function handleCreate() {
    if (!token || isSaving) {
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Введите название.");
      return;
    }
    if (!startsAt) {
      setError("Укажите дату и время начала.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (kind === "task") {
        const plannedDurationMinutes =
          startsAt && endsAt ? computeDurationMinutes(startsAt, endsAt) : null;
        await createEntry(token, {
          type: "task",
          title: trimmedTitle,
          content: trimmedTitle,
          metadata: {
            status: "inbox",
            priority: "medium",
            scheduled_at: startsAt,
            ends_at: endsAt || null,
            planned_duration_minutes: plannedDurationMinutes,
            source: "calendar_create",
          },
        });
      } else {
        await createEntry(token, {
          type: "event",
          title: trimmedTitle,
          content: trimmedTitle,
          metadata: {
            starts_at: startsAt,
            ends_at: endsAt || null,
            location: location.trim() || null,
            status: kind === "meeting" ? "attending" : "tracking",
            source: "calendar_create",
          },
        });
      }
      onClearSelection?.();
      resetForm();
      await onCreated();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось создать запись."));
    } finally {
      setIsSaving(false);
    }
  }

  const showLocation = kind === "event" || kind === "meeting";

  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-panel">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CalendarPlus className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Новая запись</h2>
          <p className="text-xs text-muted-foreground">Кликните по пустому времени в календаре</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {kindOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={cn(
              "filter-pill",
              kind === option.value ? "filter-pill-active" : "filter-pill-inactive",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="calendar-create-title">Название</FieldLabel>
          <Input
            id="calendar-create-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={kind === "meeting" ? "Созвон с..." : kind === "event" ? "Событие..." : "Задача..."}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="calendar-create-start">Начало</FieldLabel>
          <Input
            id="calendar-create-start"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => handleStartsAtChange(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="calendar-create-end">Окончание</FieldLabel>
          <Input
            id="calendar-create-end"
            type="datetime-local"
            value={endsAt}
            min={startsAt || undefined}
            onChange={(event) => {
              setManualTimes(true);
              setEndsAt(event.target.value);
            }}
          />
        </Field>
        {showLocation ? (
          <Field>
            <FieldLabel htmlFor="calendar-create-location">Место</FieldLabel>
            <Input
              id="calendar-create-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Офис, Zoom, адрес..."
            />
          </Field>
        ) : null}
        {error ? <Notice variant="error">{error}</Notice> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleCreate()} disabled={isSaving || !title.trim()}>
            <Plus data-icon="inline-start" />
            {isSaving ? "Создание..." : "Создать"}
          </Button>
          <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
            Очистить
          </Button>
        </div>
      </FieldGroup>
    </div>
  );
}

function defaultSlotTimes(selectedDay: Date | null) {
  const day = startOfDay(selectedDay ?? new Date());
  const now = new Date();
  const base = isSameCalendarDay(day, now) ? now : day;
  const rounded = roundToNext30Minutes(base);
  if (!isSameCalendarDay(day, now)) {
    rounded.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    if (rounded.getHours() < 7) {
      rounded.setHours(9, 0, 0, 0);
    }
  }
  const end = new Date(rounded);
  end.setHours(end.getHours() + 1);
  return {
    startsAt: toLocalInputFromDate(rounded),
    endsAt: toLocalInputFromDate(end),
  };
}

function roundToNext30Minutes(date: Date) {
  const result = new Date(date);
  const minutes = result.getMinutes();
  const roundedMinutes = minutes < 30 ? 30 : 0;
  const addHour = minutes >= 30 ? 1 : 0;
  result.setMinutes(roundedMinutes, 0, 0);
  if (addHour) {
    result.setHours(result.getHours() + 1);
  }
  return result;
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function toLocalInputFromDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
