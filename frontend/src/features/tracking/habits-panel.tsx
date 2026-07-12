"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FilePenLine,
  PauseCircle,
  Plus,
  SkipForward,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, fetchAllEntries, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import {
  formatDateKey,
  habitMetadataPayload,
  habitMetrics,
  habitRegularityLabel,
  normalizeHabitMetadata,
  readHabitMetadata,
  setHabitLog,
  weekdayShortLabel,
  type HabitLogStatus,
  type HabitMetadata,
  type HabitRangeDays,
  type HabitRegularityKind,
  type HabitStage,
} from "@/lib/habits";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TRACKING_GRID, TRACKING_SCROLL_COL } from "@/features/tracking/tracking-layout";

type StageFilter = "active" | HabitStage;

type HabitForm = {
  title: string;
  stage: HabitStage;
  regularityKind: HabitRegularityKind;
  weekdays: number[];
  target: string;
};

const emptyHabitForm: HabitForm = {
  title: "",
  stage: "tracking",
  regularityKind: "daily",
  weekdays: [1, 3, 5],
  target: "3",
};

const stageFilters: Array<{ value: StageFilter; label: string }> = [
  { value: "active", label: "Активные" },
  { value: "desired", label: "Хочу внедрить" },
  { value: "tracking", label: "Отслеживаю" },
  { value: "automatic", label: "Автоматические" },
  { value: "archived", label: "Архив" },
];

const stageLabels: Record<HabitStage, string> = {
  desired: "Хочу внедрить",
  tracking: "Отслеживаю",
  automatic: "Автоматическая",
  archived: "Архив",
};

const rangeOptions: HabitRangeDays[] = [7, 30, 90, 365];
const weekdays = [1, 2, 3, 4, 5, 6, 7];

export function HabitsPanel({ embedded = false, compact = false }: { embedded?: boolean; compact?: boolean }) {
  const { token } = useRequireAuth();
  const [habits, setHabits] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>("active");
  const [rangeDays, setRangeDays] = useState<HabitRangeDays>(30);
  const [form, setForm] = useState<HabitForm>(emptyHabitForm);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingLogId, setUpdatingLogId] = useState<string | null>(null);

  const selectedHabit = habits.find((habit) => habit.id === selectedId) ?? null;
  const visibleHabits = useMemo(
    () =>
      habits.filter((habit) => {
        const stage = readHabitMetadata(habit).stage;
        return stageFilter === "active" ? stage !== "archived" : stage === stageFilter;
      }),
    [habits, stageFilter],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    fetchAllEntries(token, { type: "habit" })
      .then((result) => setHabits(result.items))
      .catch((requestError) => {
        setLoadError(getErrorMessage(requestError, "Не удалось загрузить привычки."));
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  function startNewHabit() {
    setSelectedId(null);
    setForm(emptyHabitForm);
    setError(null);
    setNotice(null);
  }

  function editHabit(habit: Entry) {
    setSelectedId(habit.id);
    setForm(habitToForm(habit));
    setError(null);
    setNotice(null);
  }

  async function saveHabit() {
    if (!token || isSaving) {
      return;
    }

    const title = form.title.trim();
    if (!title) {
      setError("Добавь название привычки.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const previousLogs = selectedHabit ? readHabitMetadata(selectedHabit).logs : {};
      const metadata = habitMetadataPayload(formToMetadata(form, previousLogs));
      const payload = { type: "habit" as const, title, content: title, metadata };
      const saved = selectedHabit
        ? await updateEntry(token, selectedHabit.id, payload)
        : await createEntry(token, payload);

      setHabits((current) => {
        const withoutSaved = current.filter((habit) => habit.id !== saved.id);
        return [saved, ...withoutSaved];
      });
      setSelectedId(saved.id);
      setForm(habitToForm(saved));
      setNotice(selectedHabit ? "Привычка обновлена." : "Привычка создана.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить привычку."));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleHabitStatus(habit: Entry, status: HabitLogStatus) {
    if (!token || updatingLogId) {
      return;
    }

    const todayKey = formatDateKey(new Date());
    const metadata = readHabitMetadata(habit);
    const nextStatus = metadata.logs[todayKey] === status ? null : status;
    const nextMetadata = habitMetadataPayload(setHabitLog(metadata, todayKey, nextStatus));

    setUpdatingLogId(habit.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateEntry(token, habit.id, { metadata: nextMetadata });
      setHabits((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось отметить привычку."));
    } finally {
      setUpdatingLogId(null);
    }
  }

  return (
    <>
      <div className={cn("flex w-full flex-col", compact ? "min-h-0 flex-1 gap-3" : "mx-auto max-w-[1400px] gap-5")}>
        {!embedded ? (
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold leading-8">Привычки</h1>
            <p className="text-sm text-muted-foreground">Отмечай прогресс без чувства вины: skip и отдых не ломают streak.</p>
          </header>
        ) : null}

        {loadError ? (
          <Notice variant="error">
            <div className="flex flex-col gap-2">
              <span>{loadError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => {
                  if (!token) {
                    return;
                  }
                  setIsLoading(true);
                  setLoadError(null);
                  fetchAllEntries(token, { type: "habit" })
                    .then((result) => setHabits(result.items))
                    .catch((requestError) => {
                      setLoadError(getErrorMessage(requestError, "Не удалось загрузить привычки."));
                    })
                    .finally(() => setIsLoading(false));
                }}
              >
                Повторить
              </Button>
            </div>
          </Notice>
        ) : null}
        {error ? <Notice variant="error">{error}</Notice> : null}
        {notice ? <Notice variant="success">{notice}</Notice> : null}

        <div className={cn(compact ? TRACKING_GRID : "grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]")}>
          <Card className={cn(compact && TRACKING_SCROLL_COL, compact && "xl:self-stretch")}>
            <CardHeader className={cn("flex-row items-center justify-between gap-3", compact && "px-3 py-3 xl:px-4")}>
              <CardTitle className={compact ? "text-base xl:text-lg" : undefined}>{selectedHabit ? "Редактировать" : "Новая привычка"}</CardTitle>
              {selectedHabit ? (
                <Button type="button" variant="outline" size="sm" onClick={startNewHabit}>
                  <Plus data-icon="inline-start" />
                  Новая
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <FieldGroup className={compact ? "gap-3" : undefined}>
                <Field>
                  <FieldLabel htmlFor="habit-title">Название</FieldLabel>
                  <Input
                    id="habit-title"
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Например: Утренняя зарядка"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="habit-stage">Стадия</FieldLabel>
                  <Select
                    id="habit-stage"
                    value={form.stage}
                    onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value as HabitStage }))}
                  >
                    <option value="desired">Хочу внедрить</option>
                    <option value="tracking">Осознанно внедряю</option>
                    <option value="automatic">Уже автоматическая</option>
                    <option value="archived">Больше не актуально</option>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="habit-regularity">Регулярность</FieldLabel>
                  <Select
                    id="habit-regularity"
                    value={form.regularityKind}
                    onChange={(event) => setForm((current) => nextRegularityForm(current, event.target.value as HabitRegularityKind))}
                  >
                    <option value="daily">Каждый день</option>
                    <option value="weekdays">Выбранные дни недели</option>
                    <option value="weekly_target">Цель в неделю</option>
                    <option value="monthly_target">Цель в месяц</option>
                  </Select>
                </Field>

                {form.regularityKind === "weekdays" ? (
                  <Field>
                    <FieldLabel>Дни недели</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {weekdays.map((day) => {
                        const selected = form.weekdays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleWeekday(day, setForm)}
                            className={cn(
                              "focus-ring min-h-10 rounded-md border px-3 text-sm font-medium transition",
                              selected
                                ? "filter-pill-active"
                                : "filter-pill-inactive",
                            )}
                          >
                            {weekdayShortLabel(day)}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                ) : null}

                {form.regularityKind === "weekly_target" || form.regularityKind === "monthly_target" ? (
                  <Field>
                    <FieldLabel htmlFor="habit-target">
                      {form.regularityKind === "weekly_target" ? "Раз в неделю" : "Раз в месяц"}
                    </FieldLabel>
                    <Input
                      id="habit-target"
                      type="number"
                      min={1}
                      max={form.regularityKind === "weekly_target" ? 7 : 31}
                      value={form.target}
                      onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))}
                    />
                  </Field>
                ) : null}

                <Button type="button" onClick={() => void saveHabit()} disabled={isSaving}>
                  <CheckCircle2 data-icon="inline-start" />
                  {isSaving ? "Сохранение" : selectedHabit ? "Сохранить" : "Создать"}
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>

          <section className={cn("flex min-h-0 flex-col", compact ? `gap-3 ${TRACKING_SCROLL_COL}` : "gap-4")}>
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card shadow-panel",
                compact ? "shrink-0 p-3" : "flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between",
              )}
            >
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Фильтр stage">
                {stageFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    role="tab"
                    aria-selected={stageFilter === filter.value}
                    onClick={() => setStageFilter(filter.value)}
                    className={cn(
                      compact ? "filter-pill filter-pill-compact" : "filter-pill",
                      stageFilter === filter.value ? "filter-pill-active" : "filter-pill-inactive",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Период метрик">
                {rangeOptions.map((days) => (
                  <button
                    key={days}
                    type="button"
                    role="tab"
                    aria-selected={rangeDays === days}
                    onClick={() => setRangeDays(days)}
                    className={cn(
                      compact ? "filter-pill filter-pill-compact" : "filter-pill",
                      rangeDays === days ? "filter-pill-active" : "filter-pill-inactive",
                    )}
                  >
                    {days === 365 ? "Год" : `${days} дней`}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className={cn("grid gap-3 lg:grid-cols-2 2xl:grid-cols-3", compact && "min-h-0 flex-1 overflow-y-auto")}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className={cn("rounded-md border border-border bg-muted/50", compact ? "min-h-48" : "min-h-56")} />
                ))}
              </div>
            ) : visibleHabits.length === 0 ? (
              <Empty
                title={habits.length === 0 ? "Привычек пока нет" : "В этом фильтре привычек нет"}
                actionLabel={habits.length === 0 ? "Создать привычку" : undefined}
                onAction={habits.length === 0 ? startNewHabit : undefined}
              />
            ) : (
              <div className={cn("grid gap-3 lg:grid-cols-2 2xl:grid-cols-3", compact && "min-h-0 flex-1 overflow-y-auto")}>
                {visibleHabits.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    rangeDays={rangeDays}
                    selected={habit.id === selectedId}
                    updating={updatingLogId === habit.id}
                    compact={compact}
                    onEdit={() => editHabit(habit)}
                    onToggle={(status) => void toggleHabitStatus(habit, status)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function HabitCard({
  habit,
  rangeDays,
  selected,
  updating,
  compact = false,
  onEdit,
  onToggle,
}: {
  habit: Entry;
  rangeDays: HabitRangeDays;
  selected: boolean;
  updating: boolean;
  compact?: boolean;
  onEdit: () => void;
  onToggle: (status: HabitLogStatus) => void;
}) {
  const metadata = readHabitMetadata(habit);
  const metrics = habitMetrics(metadata, rangeDays);
  const todayStatus = metadata.logs[formatDateKey(new Date())] ?? null;

  return (
    <article className={cn("rounded-md border bg-card shadow-panel", compact ? "p-3" : "p-4", selected ? "border-primary" : "border-border")}>
      <div className={cn("flex items-start justify-between gap-3", compact ? "mb-3" : "mb-4")}>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant={metadata.stage === "tracking" ? "default" : "secondary"}>{stageLabels[metadata.stage]}</Badge>
            <Badge variant="outline">{habitRegularityLabel(metadata.regularity)}</Badge>
          </div>
          <h2 className={cn("truncate font-semibold", compact ? "text-base" : "text-lg")}>{habit.title}</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <FilePenLine data-icon="inline-start" />
          Править
        </Button>
      </div>

      <div className={cn("grid gap-3 sm:grid-cols-3", compact ? "mb-3" : "mb-4")}>
        <Metric compact={compact} label="Выполнение" value={`${metrics.completionRate}%`} />
        <Metric compact={compact} label="Серия" value={String(metrics.currentStreak)} />
        <Metric compact={compact} label="Лучшая серия" value={String(metrics.bestStreak)} />
      </div>

      <p className={cn("text-sm text-muted-foreground", compact ? "mb-2" : "mb-3")}>Ты сделал {metrics.doneCount} раз за период.</p>
      <HabitHeatmap compact={compact} days={metrics.heatmap} />

      <div className={cn("flex flex-wrap gap-2", compact ? "mt-3" : "mt-4")}>
        <HabitActionButton
          active={todayStatus === "done"}
          disabled={updating}
          label="Сделал"
          icon={CheckCircle2}
          onClick={() => onToggle("done")}
        />
        <HabitActionButton
          active={todayStatus === "skip"}
          disabled={updating}
          label="Пропуск"
          icon={SkipForward}
          onClick={() => onToggle("skip")}
        />
        <HabitActionButton
          active={todayStatus === "rest"}
          disabled={updating}
          label="День отдыха"
          icon={PauseCircle}
          onClick={() => onToggle("rest")}
        />
      </div>
    </article>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border bg-background", compact ? "p-2" : "p-3")}>
      <div className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono font-semibold", compact ? "text-lg" : "text-xl")}>{value}</div>
    </div>
  );
}

function HabitHeatmap({ days, compact = false }: { days: ReturnType<typeof habitMetrics>["heatmap"]; compact?: boolean }) {
  const columns = Math.ceil(days.length / 7);

  return (
    <div>
      <div
        className="grid grid-flow-col grid-rows-7 gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(8px, 1fr))` }}
        aria-label="Календарная heatmap выполнения"
      >
        {days.map((day) => (
          <span
            key={day.key}
            title={`${day.key}: ${day.status ?? (day.scheduled ? "нет отметки" : "не запланировано")}`}
            className={cn(
              "rounded-sm border",
              compact ? "size-2.5" : "size-3",
              day.status === "done"
                ? "border-accent bg-accent"
                : day.status === "skip" || day.status === "rest"
                  ? "border-muted-foreground/40 bg-muted-foreground/30"
                  : day.scheduled
                    ? "border-border bg-muted"
                    : "border-border bg-transparent",
            )}
          />
        ))}
      </div>
      <div className={cn("flex flex-wrap gap-2 text-xs text-muted-foreground", compact ? "mt-2" : "mt-3")}>
        <span className="inline-flex items-center gap-1"><span className={cn("rounded-sm bg-accent", compact ? "size-2.5" : "size-3")} /> сделано</span>
        <span className="inline-flex items-center gap-1"><span className={cn("rounded-sm bg-muted-foreground/30", compact ? "size-2.5" : "size-3")} /> пропуск / отдых</span>
        <span className="inline-flex items-center gap-1"><span className={cn("rounded-sm border border-border bg-muted", compact ? "size-2.5" : "size-3")} /> без наказания</span>
      </div>
    </div>
  );
}

function HabitActionButton({
  active,
  disabled,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant={active ? "default" : "outline"} size="sm" disabled={disabled} onClick={onClick}>
      <Icon data-icon="inline-start" />
      {label}
    </Button>
  );
}

function habitToForm(habit: Entry): HabitForm {
  const metadata = readHabitMetadata(habit);
  return {
    title: habit.title,
    stage: metadata.stage,
    regularityKind: metadata.regularity.kind,
    weekdays: metadata.regularity.weekdays.length > 0 ? metadata.regularity.weekdays : [1, 3, 5],
    target: String(metadata.regularity.target ?? (metadata.regularity.kind === "monthly_target" ? 10 : 3)),
  };
}

function formToMetadata(form: HabitForm, logs: HabitMetadata["logs"]): HabitMetadata {
  return normalizeHabitMetadata({
    stage: form.stage,
    regularity:
      form.regularityKind === "weekdays"
        ? { kind: "weekdays", weekdays: form.weekdays }
        : form.regularityKind === "weekly_target" || form.regularityKind === "monthly_target"
          ? { kind: form.regularityKind, target: Number(form.target) }
          : { kind: "daily" },
    logs,
  });
}

function nextRegularityForm(current: HabitForm, kind: HabitRegularityKind): HabitForm {
  return {
    ...current,
    regularityKind: kind,
    target: kind === "monthly_target" ? "10" : current.target || "3",
    weekdays: current.weekdays.length > 0 ? current.weekdays : [1, 3, 5],
  };
}

function toggleWeekday(day: number, setForm: (callback: (current: HabitForm) => HabitForm) => void) {
  setForm((current) => {
    const weekdays = current.weekdays.includes(day)
      ? current.weekdays.filter((item) => item !== day)
      : [...current.weekdays, day].sort();
    return { ...current, weekdays: weekdays.length > 0 ? weekdays : current.weekdays };
  });
}
