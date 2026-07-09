"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlarmClock,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Sparkles,
  Plus,
  Repeat,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EventsPanel } from "@/features/plans/events-panel";
import { PlansWeekCalendar } from "@/features/plans/plans-week-calendar";
import { TasksPanel } from "@/features/plans/tasks-panel";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, getErrorMessage, listEntries, parseTasks, updateEntry } from "@/lib/api";
import {
  type AgendaItem,
  type PlansScope,
  type PlansTypeFilter,
  agendaLabel,
  buildAgendaItems,
  filterPlansItems,
  formatAgendaDateTime,
} from "@/lib/agenda";
import {
  isOccurrenceSkipped,
  readTaskRecurrence,
  recurrenceRuleLabel,
  restoreOccurrenceMetadata,
  restoreWeekMetadata,
  skipOccurrenceMetadata,
  skipWeekMetadata,
} from "@/lib/recurrence";
import { formatDate, getString } from "@/lib/entry-helpers";
import { formatEntryType, formatTaskStatus } from "@/lib/labels";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

const scopeFilters: Array<{ value: PlansScope; label: string }> = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "overdue", label: "Просрочено" },
  { value: "all", label: "Все" },
];

const typeFilters: Array<{ value: PlansTypeFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "tasks", label: "Задачи" },
  { value: "events", label: "События" },
  { value: "reminders", label: "Напоминания" },
];

export function PlansView() {
  const { token } = useRequireAuth();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as PlansTypeFilter | "tasks" | "events" | "reminders" | null) ?? "all";
  const normalizedTab: PlansTypeFilter =
    initialTab === "tasks" ? "tasks" : initialTab === "events" ? "events" : initialTab === "reminders" ? "reminders" : "all";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scope, setScope] = useState<PlansScope>("week");
  const [typeFilter, setTypeFilter] = useState<PlansTypeFilter>(normalizedTab);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("selected"));
  const [quickInput, setQuickInput] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [detailMode, setDetailMode] = useState<"timeline" | "calendar" | "tasks" | "events">(
    initialTab === "tasks" ? "tasks" : initialTab === "events" ? "events" : "timeline",
  );
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(searchParams.get("selected"));

  const loadEntries = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [tasks, events, reminders] = await Promise.all([
        listEntries(token, { type: "task", limit: 100 }),
        listEntries(token, { type: "event", limit: 100 }),
        listEntries(token, { type: "reminder", limit: 100 }),
      ]);
      setEntries([...tasks.items, ...events.items, ...reminders.items]);
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить планы."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const agendaItems = useMemo(() => buildAgendaItems(entries), [entries]);
  const visibleItems = useMemo(
    () => filterPlansItems(agendaItems, scope, typeFilter),
    [agendaItems, scope, typeFilter],
  );
  const selectedItem =
    agendaItems.find((item) => item.id === selectedAgendaId) ??
    visibleItems.find((item) => item.entry?.id === selectedId) ??
    agendaItems.find((item) => item.entry?.id === selectedId) ??
    null;

  async function createFromQuickInput() {
    if (!token || !quickInput.trim() || isQuickSaving) {
      return;
    }
    setIsQuickSaving(true);
    setQuickError(null);
    try {
      const result = await parseTasks(token, quickInput.trim());
      const tasks = result.tasks.filter((task) => task.title?.trim());
      if (tasks.length === 0) {
        await createEntry(token, {
          type: "task",
          title: quickInput.trim(),
          content: quickInput.trim(),
          metadata: { status: "inbox", priority: "medium", source: "plans_quick" },
        });
      } else {
        await Promise.all(
          tasks.map((task) =>
            createEntry(token, {
              type: "task",
              title: task.title,
              content: task.description || task.title,
              metadata: {
                status: task.status ?? "inbox",
                priority: task.priority ?? "medium",
                scheduled_at: task.scheduled_at ?? null,
                deadline: task.deadline ?? null,
                source: "plans_quick",
              },
            }),
          ),
        );
      }
      setQuickInput("");
      await loadEntries();
    } catch (requestError) {
      setQuickError(getErrorMessage(requestError, "Не удалось создать запись."));
    } finally {
      setIsQuickSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-8">Планы</h1>
        <p className="text-sm text-muted-foreground">Задачи, события и напоминания на одной временной оси.</p>
      </header>

      {loadError ? <Notice variant="error">{loadError}</Notice> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={detailMode === "timeline" ? "secondary" : "outline"}
          size="sm"
          onClick={() => setDetailMode("timeline")}
        >
          Лента
        </Button>
        <Button
          type="button"
          variant={detailMode === "calendar" ? "secondary" : "outline"}
          size="sm"
          onClick={() => setDetailMode("calendar")}
        >
          <CalendarDays data-icon="inline-start" />
          Календарь
        </Button>
        <Button
          type="button"
          variant={detailMode === "tasks" ? "secondary" : "outline"}
          size="sm"
          onClick={() => setDetailMode("tasks")}
        >
          Задачи
        </Button>
        <Button
          type="button"
          variant={detailMode === "events" ? "secondary" : "outline"}
          size="sm"
          onClick={() => setDetailMode("events")}
        >
          События
        </Button>
      </div>

      {detailMode === "tasks" ? <TasksPanel embedded /> : null}
      {detailMode === "events" ? <EventsPanel embedded /> : null}

      {detailMode === "calendar" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
          <PlansWeekCalendar
            className="max-h-[calc(100dvh-11rem)] min-h-[520px]"
            entries={entries}
            selectedId={selectedAgendaId}
            onSelect={(item) => {
              setSelectedAgendaId(item.id);
              setSelectedId(item.entry?.id ?? null);
            }}
          />
          <PlanInspector item={selectedItem} token={token} onUpdated={loadEntries} />
        </section>
      ) : null}

      {detailMode === "timeline" ? (
        <>
          <section className="rounded-md border border-border bg-card p-3 shadow-panel">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
              <Field>
                <FieldLabel htmlFor="plans-quick-input">Быстрый ввод</FieldLabel>
                <Textarea
                  id="plans-quick-input"
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  className="min-h-[72px] resize-y text-base leading-6"
                  placeholder="Например: завтра в 18:00 созвон с Анной"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void createFromQuickInput()} disabled={isQuickSaving || !quickInput.trim()}>
                  <Sparkles data-icon="inline-start" />
                  {isQuickSaving ? "Создание" : "Создать"}
                </Button>
              </div>
            </div>
            {quickError ? <Notice variant="error" className="mt-3">{quickError}</Notice> : null}
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-md border border-border bg-card shadow-panel">
              <div className="border-b border-border p-4">
                <div className="flex flex-wrap gap-2">
                  {scopeFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setScope(filter.value)}
                      className={cn("filter-pill", scope === filter.value ? "filter-pill-active" : "filter-pill-inactive")}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {typeFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setTypeFilter(filter.value)}
                      className={cn(
                        "filter-pill",
                        typeFilter === filter.value ? "filter-pill-active" : "filter-pill-inactive",
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2">
                {isLoading ? (
                  <div className="flex flex-col gap-2 p-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="h-14 rounded-md bg-muted" />
                    ))}
                  </div>
                ) : visibleItems.length === 0 ? (
                  <div className="p-8">
                    <Empty title="Ничего в этом срезе" />
                  </div>
                ) : (
                  visibleItems.map((item) => (
                    <TimelineRow
                      key={item.id}
                      item={item}
                      selected={selectedAgendaId === item.id || selectedId === item.entry?.id}
                      onSelect={() => {
                        setSelectedAgendaId(item.id);
                        setSelectedId(item.entry?.id ?? null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>

            <PlanInspector
              item={selectedItem}
              token={token}
              onUpdated={loadEntries}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}

function TimelineRow({
  item,
  selected,
  onSelect,
}: {
  item: AgendaItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = item.kind === "task" ? CheckSquare : item.kind === "event" ? CalendarRange : AlarmClock;
  const status =
    item.entry?.type === "task" ? getString(item.entry.metadata.status, "inbox") : getString(item.entry?.metadata.status);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "focus-ring grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-3 text-left transition",
        selected ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted",
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-muted text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="mt-1 flex flex-wrap gap-2">
          <Badge variant="outline">{agendaLabel(item.kind)}</Badge>
          {item.recurring ? <Badge variant="outline">Повтор</Badge> : null}
          {status ? <Badge variant="secondary">{formatTaskStatus(status)}</Badge> : null}
        </span>
      </span>
      <span className="text-sm text-muted-foreground">{formatAgendaDateTime(item.date)}</span>
    </button>
  );
}

function PlanInspector({
  item,
  token,
  onUpdated,
}: {
  item: AgendaItem | null;
  token: string | null;
  onUpdated: () => Promise<void>;
}) {
  const entry = item?.entry ?? null;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [status, setStatus] = useState("inbox");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const recurrence = entry?.type === "task" ? readTaskRecurrence(entry.metadata) : null;
  const occurrenceSkipped = item?.occurrenceDate
    ? isOccurrenceSkipped(entry?.metadata ?? {}, item.date)
    : false;

  useEffect(() => {
    if (!entry) {
      setTitle("");
      setContent("");
      setDateValue("");
      setStatus("inbox");
      return;
    }
    setTitle(entry.title);
    setContent(entry.content);
    if (entry.type === "task") {
      setDateValue(resolveInspectorDateValue(entry, item, "scheduled_at", "deadline"));
      setStatus(getString(entry.metadata.status, "inbox"));
    } else if (entry.type === "event") {
      setDateValue(resolveInspectorDateValue(entry, item, "starts_at"));
      setStatus(getString(entry.metadata.status));
    } else if (entry.type === "reminder") {
      setDateValue(resolveInspectorDateValue(entry, item, "remind_at"));
      setStatus(getString(entry.metadata.status, "scheduled"));
    }
  }, [entry, item]);

  async function updateRecurrenceMetadata(nextMetadata: Record<string, unknown>) {
    if (!token || !entry) {
      return;
    }
    setIsSkipping(true);
    setError(null);
    try {
      await updateEntry(token, entry.id, { metadata: nextMetadata });
      await onUpdated();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось обновить повторение."));
    } finally {
      setIsSkipping(false);
    }
  }

  async function save() {
    if (!token || !entry) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      if (entry.type === "task") {
        await updateEntry(token, entry.id, {
          title,
          content,
          metadata: {
            ...entry.metadata,
            status,
            ...(item?.recurring ? {} : { scheduled_at: dateValue || null }),
          },
        });
      } else if (entry.type === "event") {
        await updateEntry(token, entry.id, {
          title,
          content,
          metadata: { ...entry.metadata, status, starts_at: dateValue || null },
        });
      } else if (entry.type === "reminder") {
        await updateEntry(token, entry.id, {
          title,
          content,
          metadata: { ...entry.metadata, status, remind_at: dateValue || null },
        });
      }
      await onUpdated();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить."));
    } finally {
      setIsSaving(false);
    }
  }

  if (!entry) {
    return (
      <aside className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Выбери элемент в календаре или ленте, чтобы отредактировать детали.
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-border bg-card p-4 shadow-panel xl:sticky xl:top-4 xl:max-h-[calc(100dvh-11rem)] xl:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{formatEntryType(entry.type)}</h2>
        <Badge variant="secondary">{formatDate(entry.updated_at)}</Badge>
      </div>

      {item?.recurring && recurrence ? (
        <div className="mb-4 rounded-md border border-border bg-muted/20 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-secondary-foreground">
            <Repeat className="size-4" aria-hidden="true" />
            Еженедельный план
          </div>
          <p className="mt-2 text-muted-foreground">{recurrenceRuleLabel(recurrence)}</p>
          {item.occurrenceDate ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Вхождение: {formatAgendaDateTime(item.date)}
              {occurrenceSkipped ? " · отменено" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="plan-title">Название</FieldLabel>
          <Input id="plan-title" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-content">Описание</FieldLabel>
          <Textarea id="plan-content" value={content} onChange={(event) => setContent(event.target.value)} className="min-h-24" />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-date">
            {item?.recurring ? "Дата вхождения" : "Дата и время"}
          </FieldLabel>
          <Input
            id="plan-date"
            type="datetime-local"
            value={dateValue}
            readOnly={Boolean(item?.recurring)}
            onChange={(event) => setDateValue(event.target.value)}
            className={item?.recurring ? "bg-muted/40" : undefined}
          />
          {item?.recurring ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Для еженедельного плана дата берётся из календаря. Чтобы изменить время повторения, открой задачу во вкладке «Задачи».
            </p>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-status">Статус</FieldLabel>
          <Select id="plan-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {entry.type === "task" ? (
              <>
                <option value="inbox">Не выполнена</option>
                <option value="active">В работе</option>
                <option value="done">Выполнена</option>
                <option value="cancelled">Отменена</option>
              </>
            ) : entry.type === "event" ? (
              <>
                <option value="planned">Запланировано</option>
                <option value="done">Завершено</option>
                <option value="cancelled">Отменено</option>
                <option value="skipped">Пропущено</option>
              </>
            ) : (
              <>
                <option value="scheduled">Запланировано</option>
                <option value="done">Готово</option>
                <option value="cancelled">Отменено</option>
              </>
            )}
          </Select>
        </Field>
        {error ? <Notice variant="error">{error}</Notice> : null}

        {item?.recurring && item.occurrenceDate ? (
          <div className="flex flex-col gap-2">
            {occurrenceSkipped ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSkipping}
                  onClick={() => void updateRecurrenceMetadata(restoreOccurrenceMetadata(entry.metadata, item.date))}
                >
                  Вернуть на этот день
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSkipping}
                  onClick={() => void updateRecurrenceMetadata(restoreWeekMetadata(entry.metadata, item.date))}
                >
                  Вернуть всю неделю
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSkipping}
                  onClick={() => void updateRecurrenceMetadata(skipOccurrenceMetadata(entry.metadata, item.date))}
                >
                  Отменить на этот день
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSkipping}
                  onClick={() => void updateRecurrenceMetadata(skipWeekMetadata(entry.metadata, item.date))}
                >
                  Отменить всю неделю
                </Button>
              </>
            )}
          </div>
        ) : null}

        <Button onClick={() => void save()} disabled={isSaving}>
          <Plus data-icon="inline-start" />
          {isSaving ? "Сохранение" : "Сохранить"}
        </Button>
      </FieldGroup>
    </aside>
  );
}

function toLocalInput(value: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.length >= 16 ? value.slice(0, 16) : value;
  }
  return toLocalInputFromDate(date);
}

function toLocalInputFromDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolveInspectorDateValue(
  entry: Entry,
  item: AgendaItem | null,
  ...metadataKeys: string[]
) {
  if (item?.date && !Number.isNaN(item.date.getTime())) {
    return toLocalInputFromDate(item.date);
  }

  for (const key of metadataKeys) {
    const value = getString(entry.metadata[key]);
    if (value) {
      return toLocalInput(value);
    }
  }

  return "";
}
