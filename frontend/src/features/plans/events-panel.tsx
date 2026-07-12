"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  CalendarRange,
  FilePenLine,
  Link2,
  MapPin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, fetchAllEntries, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import { formatDate, getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

const eventStatuses = ["tracking", "attending", "skipped", "cancelled"] as const;
type EventStatus = (typeof eventStatuses)[number];
type EventScopeFilter = "upcoming" | "today" | "week" | "past" | "all";

type EventForm = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: EventStatus;
  sourceUrl: string;
  linkedTaskIds: string[];
  reminderAt: string;
  reminderText: string;
  reminderId: string;
};

const emptyEventForm: EventForm = {
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  location: "",
  status: "tracking",
  sourceUrl: "",
  linkedTaskIds: [],
  reminderAt: "",
  reminderText: "",
  reminderId: "",
};

const eventScopeFilters: Array<{ value: EventScopeFilter; label: string }> = [
  { value: "upcoming", label: "Будущие" },
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "past", label: "Прошедшие" },
  { value: "all", label: "Все" },
];

const eventStatusLabels: Record<EventStatus, string> = {
  tracking: "Отслеживаю",
  attending: "Пойду",
  skipped: "Пропущено",
  cancelled: "Отменено",
};

export function EventsPanel({
  embedded = false,
  initialSelectedId = null,
}: {
  embedded?: boolean;
  initialSelectedId?: string | null;
}) {
  const { token } = useRequireAuth();
  const [events, setEvents] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [mobileDetailView, setMobileDetailView] = useState(Boolean(initialSelectedId));
  const [eventQuery, setEventQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<EventScopeFilter>("upcoming");
  const [form, setForm] = useState<EventForm>(emptyEventForm);
  const [linkedTaskCandidate, setLinkedTaskCandidate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedId(initialSelectedId);
    if (initialSelectedId) {
      setMobileDetailView(true);
    }
  }, [initialSelectedId]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId],
  );
  const linkedTasks = useMemo(
    () => form.linkedTaskIds.map((id) => tasks.find((task) => task.id === id)).filter((task): task is Entry => Boolean(task)),
    [form.linkedTaskIds, tasks],
  );
  const filteredEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    return sortEventsForList(events).filter((event) => {
      const searchableText = [
        event.title,
        event.content,
        getString(event.metadata.location),
        getString(event.metadata.source_url),
      ]
        .join("\n")
        .toLowerCase();
      return matchesEventScope(event, scopeFilter) && (!query || searchableText.includes(query));
    });
  }, [eventQuery, events, scopeFilter]);

  const todayCount = events.filter((event) => matchesEventScope(event, "today")).length;
  const weekCount = events.filter((event) => matchesEventScope(event, "week")).length;
  const upcomingCount = events.filter((event) => matchesEventScope(event, "upcoming")).length;
  const hasActiveFilters = Boolean(eventQuery.trim()) || scopeFilter !== "upcoming";

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      fetchAllEntries(token, { type: "event" }),
      fetchAllEntries(token, { type: "task" }),
    ])
      .then(([eventResult, taskResult]) => {
        if (isMounted) {
          setEvents(eventResult.items);
          setTasks(taskResult.items);
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setLoadError(getErrorMessage(requestError, "Не удалось загрузить события."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  function selectEvent(event: Entry) {
    setSelectedId(event.id);
    setForm(eventToForm(event));
    setLinkedTaskCandidate("");
    setError(null);
    setMobileDetailView(true);
  }

  function startNewEvent() {
    setSelectedId(null);
    setForm(emptyEventForm);
    setLinkedTaskCandidate("");
    setError(null);
    setMobileDetailView(true);
  }

  function closeMobileDetail() {
    setMobileDetailView(false);
    setSelectedId(null);
    setForm(emptyEventForm);
    setError(null);
  }

  function resetEventFilters() {
    setEventQuery("");
    setScopeFilter("upcoming");
  }

  async function refreshEvents(nextSelected?: Entry) {
    if (!token) {
      return;
    }

    const result = await fetchAllEntries(token, { type: "event" });
    setEvents(result.items);
    if (nextSelected) {
      setSelectedId(nextSelected.id);
      setForm(eventToForm(nextSelected));
    }
  }

  async function saveEvent() {
    if (!token || isSaving) {
      return;
    }
    if (!form.title.trim()) {
      setError("Добавь название события.");
      return;
    }
    if (!form.startsAt) {
      setError("Добавь дату и время начала.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = formToEventPayload(form);
      const savedEvent = selectedId
        ? await updateEntry(token, selectedId, payload)
        : await createEntry(token, payload);
      const saved = await saveReminderForEvent(savedEvent);
      await refreshEvents(saved);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить событие."));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveReminderForEvent(event: Entry) {
    if (!token) {
      return event;
    }

    const reminderAt = form.reminderAt.trim();
    const reminderText = form.reminderText.trim();
    if (!reminderAt && !reminderText) {
      if (!form.reminderId) {
        return event;
      }
      return updateEntry(token, event.id, {
        metadata: {
          ...event.metadata,
          reminder_id: null,
          reminder_at: null,
          reminder_text: null,
        },
      });
    }

    const reminderPayload = {
      type: "reminder" as const,
      title: `Напоминание: ${event.title}`,
      content: reminderText || event.title,
      metadata: {
        remind_at: reminderAt || null,
        target_entry_id: event.id,
        target_entry_type: "event",
        target_title: event.title,
        status: "scheduled",
      },
    };
    const reminder = form.reminderId
      ? await updateEntry(token, form.reminderId, reminderPayload)
      : await createEntry(token, reminderPayload);

    return updateEntry(token, event.id, {
      metadata: {
        ...event.metadata,
        reminder_id: reminder.id,
        reminder_at: reminderAt || null,
        reminder_text: reminderText || null,
      },
    });
  }

  async function removeEvent() {
    if (!token || !selectedEvent) {
      return;
    }

    const confirmed = window.confirm(`Удалить событие "${selectedEvent.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteEntry(token, selectedEvent.id);
      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      startNewEvent();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить событие."));
    }
  }

  function addLinkedTask() {
    if (!linkedTaskCandidate || form.linkedTaskIds.includes(linkedTaskCandidate)) {
      return;
    }
    setForm((current) => ({
      ...current,
      linkedTaskIds: [...current.linkedTaskIds, linkedTaskCandidate],
    }));
    setLinkedTaskCandidate("");
  }

  function removeLinkedTask(id: string) {
    setForm((current) => ({
      ...current,
      linkedTaskIds: current.linkedTaskIds.filter((taskId) => taskId !== id),
    }));
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {!embedded ? (
          <>
            <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold leading-8">События</h1>
                <p className="text-sm text-muted-foreground">Пары, конференции и мероприятия, которые важно держать в поле зрения.</p>
              </div>
              <Button onClick={startNewEvent}>
                <Plus data-icon="inline-start" />
                Новое событие
              </Button>
            </header>

            <section className="grid gap-3 md:grid-cols-3">
              <EventMetric label="Будущие" value={String(upcomingCount)} />
              <EventMetric label="Сегодня" value={String(todayCount)} />
              <EventMetric label="На неделе" value={String(weekCount)} />
            </section>
          </>
        ) : null}

        {loadError ? <Notice variant="error">{loadError}</Notice> : null}

        <section className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
          <Card className={cn(mobileDetailView ? undefined : "hidden xl:block")}>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Button type="button" variant="ghost" size="sm" className="w-fit min-h-11 xl:hidden" onClick={closeMobileDetail}>
                  <ArrowLeft data-icon="inline-start" />
                  К списку
                </Button>
                <CardTitle>{selectedEvent ? "Событие" : "Новое событие"}</CardTitle>
              </div>
              {selectedEvent ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Событие</Badge>
                  <Button variant="destructive" size="sm" onClick={() => void removeEvent()}>
                    <Trash2 data-icon="inline-start" />
                    Удалить
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="event-title">Название</FieldLabel>
                  <Input
                    id="event-title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="event-description">Описание</FieldLabel>
                  <Textarea
                    id="event-description"
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    className="min-h-24"
                  />
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="event-starts-at">Начало</FieldLabel>
                    <Input
                      id="event-starts-at"
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="event-ends-at">Окончание</FieldLabel>
                    <Input
                      id="event-ends-at"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <Field>
                    <FieldLabel htmlFor="event-location">Место</FieldLabel>
                    <Input
                      id="event-location"
                      value={form.location}
                      onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="event-status">Статус</FieldLabel>
                    <Select
                      id="event-status"
                      value={form.status}
                      onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as EventStatus }))}
                    >
                      {eventStatuses.map((status) => (
                        <option key={status} value={status}>
                          {eventStatusLabels[status]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="event-source-url">Ссылка</FieldLabel>
                  <Input
                    id="event-source-url"
                    type="url"
                    value={form.sourceUrl}
                    onChange={(event) => setForm((current) => ({ ...current, sourceUrl: event.target.value }))}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="event-linked-task">Связанные задачи</FieldLabel>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Select
                      id="event-linked-task"
                      value={linkedTaskCandidate}
                      onChange={(event) => setLinkedTaskCandidate(event.target.value)}
                    >
                      <option value="">Выбрать задачу</option>
                      {tasks
                        .filter((task) => !form.linkedTaskIds.includes(task.id))
                        .map((task) => (
                          <option key={task.id} value={task.id}>
                            {task.title}
                          </option>
                        ))}
                    </Select>
                    <Button type="button" variant="outline" onClick={addLinkedTask}>
                      <Link2 data-icon="inline-start" />
                      Связать
                    </Button>
                  </div>
                  {linkedTasks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {linkedTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => removeLinkedTask(task.id)}
                          className="focus-ring inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
                        >
                          {task.title}
                          <X aria-hidden="true" className="size-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="event-reminder-at">Напомнить</FieldLabel>
                    <Input
                      id="event-reminder-at"
                      type="datetime-local"
                      value={form.reminderAt}
                      onChange={(event) => setForm((current) => ({ ...current, reminderAt: event.target.value }))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="event-reminder-text">Текст напоминания</FieldLabel>
                    <Input
                      id="event-reminder-text"
                      value={form.reminderText}
                      onChange={(event) => setForm((current) => ({ ...current, reminderText: event.target.value }))}
                    />
                  </Field>
                </div>

                {error ? <FieldError>{error}</FieldError> : null}

                <Button onClick={() => void saveEvent()} disabled={isSaving}>
                  {selectedEvent ? <FilePenLine data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                  {isSaving ? "Сохранение" : "Сохранить"}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card className={cn(mobileDetailView && "hidden xl:block")}>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Лента событий</CardTitle>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" className="min-h-11 xl:hidden" onClick={startNewEvent}>
                  <Plus data-icon="inline-start" />
                  Новое
                </Button>
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetEventFilters}>
                    <X data-icon="inline-start" />
                    Сбросить
                  </Button>
                ) : null}
                <Badge variant="secondary">{filteredEvents.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <Field>
                  <FieldLabel htmlFor="event-search">Поиск</FieldLabel>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="event-search"
                      value={eventQuery}
                      onChange={(event) => setEventQuery(event.target.value)}
                      className="pl-10"
                    />
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="event-scope-filter">Период</FieldLabel>
                  <Select
                    id="event-scope-filter"
                    value={scopeFilter}
                    onChange={(event) => setScopeFilter(event.target.value as EventScopeFilter)}
                  >
                    {eventScopeFilters.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-2" aria-label="Быстрый фильтр событий">
                {eventScopeFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={scopeFilter === filter.value}
                    onClick={() => setScopeFilter(filter.value)}
                    className={cn(
                      "filter-pill",
                      scopeFilter === filter.value ? "filter-pill-active" : "filter-pill-inactive",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-20 rounded-md bg-muted" />
                ))
              ) : filteredEvents.length === 0 ? (
                <Empty title={events.length === 0 ? "Событий пока нет" : "События не найдены"} />
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredEvents.map((event) => (
                    <EventListItem
                      key={event.id}
                      event={event}
                      isSelected={selectedId === event.id}
                      onSelect={() => selectEvent(event)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

function EventMetric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <strong className="font-mono text-2xl font-semibold">{value}</strong>
      </CardContent>
    </Card>
  );
}

function EventListItem({
  event,
  isSelected,
  onSelect,
}: {
  event: Entry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const startsAt = getString(event.metadata.starts_at);
  const endsAt = getString(event.metadata.ends_at);
  const location = getString(event.metadata.location);
  const status = normalizeEventStatus(event.metadata.status);
  const hasReminder = Boolean(getString(event.metadata.reminder_id) || getString(event.metadata.reminder_at));

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "focus-ring grid min-h-20 cursor-pointer grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-md border px-3 py-3 text-left transition",
        isSelected ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted/40",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
        <CalendarRange aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{event.title}</span>
          <Badge variant={status === "attending" ? "default" : "secondary"}>{eventStatusLabels[status]}</Badge>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{formatEventRange(startsAt, endsAt)}</span>
          {location ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="size-4" />
              <span className="truncate">{location}</span>
            </span>
          ) : null}
          {hasReminder ? (
            <span className="inline-flex items-center gap-1">
              <BellRing aria-hidden="true" className="size-4" />
              напомнить
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function eventToForm(event: Entry): EventForm {
  return {
    title: event.title,
    description: event.content,
    startsAt: toDateTimeInputValue(getString(event.metadata.starts_at)),
    endsAt: toDateTimeInputValue(getString(event.metadata.ends_at)),
    location: getString(event.metadata.location),
    status: normalizeEventStatus(event.metadata.status),
    sourceUrl: getString(event.metadata.source_url),
    linkedTaskIds: readStringArray(event.metadata.linked_entry_ids),
    reminderAt: toDateTimeInputValue(getString(event.metadata.reminder_at)),
    reminderText: getString(event.metadata.reminder_text),
    reminderId: getString(event.metadata.reminder_id),
  };
}

function formToEventPayload(form: EventForm) {
  return {
    type: "event" as const,
    title: form.title.trim(),
    content: form.description.trim() || form.title.trim(),
    metadata: {
      starts_at: form.startsAt,
      ends_at: form.endsAt || null,
      location: form.location.trim() || null,
      status: form.status,
      source_url: form.sourceUrl.trim() || null,
      linked_entry_ids: form.linkedTaskIds,
      reminder_id: form.reminderId || null,
      reminder_at: form.reminderAt || null,
      reminder_text: form.reminderText.trim() || null,
    },
  };
}

function sortEventsForList(events: Entry[]) {
  return events.slice().sort((left, right) => getEventSortTime(left) - getEventSortTime(right));
}

function matchesEventScope(event: Entry, scope: EventScopeFilter) {
  if (scope === "all") {
    return true;
  }

  const date = parseEventDateValue(event.metadata.starts_at);
  if (!date) {
    return false;
  }
  const diff = dayDiffFromToday(date);
  if (scope === "today") {
    return diff === 0;
  }
  if (scope === "week") {
    return diff >= 0 && diff <= 7;
  }
  if (scope === "past") {
    return diff < 0;
  }
  const status = normalizeEventStatus(event.metadata.status);
  return diff >= 0 && !["skipped", "cancelled"].includes(status);
}

function getEventSortTime(event: Entry) {
  return parseEventDateValue(event.metadata.starts_at)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function parseEventDateValue(value: unknown) {
  const rawValue = typeof value === "string" ? value : "";
  if (!rawValue) {
    return null;
  }
  const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T09:00` : rawValue;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDiffFromToday(date: Date) {
  const day = startOfDay(date).getTime();
  const today = startOfDay(new Date()).getTime();
  return Math.round((day - today) / 86_400_000);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatEventRange(startsAt: string, endsAt: string) {
  if (!startsAt) {
    return "Без даты";
  }
  if (!endsAt) {
    return formatDate(startsAt);
  }
  return `${formatDate(startsAt)} - ${formatDate(endsAt)}`;
}

function toDateTimeInputValue(value: string) {
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T09:00`;
  }
  const localDateTime = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (localDateTime) {
    return localDateTime[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeEventStatus(value: unknown): EventStatus {
  return eventStatuses.includes(value as EventStatus) ? (value as EventStatus) : "tracking";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}
