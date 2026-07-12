"use client";

import { useMemo } from "react";
import { CalendarDays, Dumbbell, Flame, Moon, Scale, Smile, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BodyWeightChart } from "@/features/workouts/workout-chart";
import { WorkoutMetricSlider } from "@/features/workouts/workout-metric-slider";
import { formatDate } from "@/lib/entry-helpers";
import {
  averageSessionVolume,
  bodyWeightDelta,
  bodyWeightProgressPoints,
  countSessionsInPeriod,
  filterSessionsByPeriod,
  formatVolume,
  latestBodyWeight,
  latestWorkoutSession,
  sessionPreviewLabel,
  sessionTotalVolume,
  type WorkoutSession,
  type WorkoutStartForm,
} from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WorkoutStartCardProps = {
  startForm: WorkoutStartForm;
  sessions: WorkoutSession[];
  isSaving: boolean;
  onChange: (patch: Partial<WorkoutStartForm>) => void;
  onStart: () => void;
};

const METRIC_FIELDS = [
  { key: "mood" as const, label: "Настроение", icon: Smile, invert: false },
  { key: "muscleReadiness" as const, label: "Готовность мышц", icon: Dumbbell, invert: false },
  { key: "sleepQuality" as const, label: "Качество сна", icon: Moon, invert: false },
  { key: "generalFatigue" as const, label: "Общая усталость", icon: Flame, invert: true },
];

function formatTodayLabel(): string {
  return new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatWeightDelta(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${sign}${formatted} кг`;
}

function daysSinceLastWorkout(sessions: WorkoutSession[]): number | null {
  const latest = latestWorkoutSession(sessions);
  if (!latest) {
    return null;
  }
  const last = new Date(latest.date);
  const today = new Date();
  last.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - last.getTime()) / 86_400_000);
}

function formatDaysSince(days: number): string {
  if (days === 0) {
    return "сегодня";
  }
  if (days === 1) {
    return "вчера";
  }
  return `${days} дн. назад`;
}

function readinessSummaryLabel(form: WorkoutStartForm): string {
  const score =
    (form.mood + form.muscleReadiness + form.sleepQuality + (11 - form.generalFatigue)) / 4;
  if (score >= 7.5) {
    return "отличная готовность";
  }
  if (score >= 6) {
    return "хорошая готовность";
  }
  if (score >= 4.5) {
    return "нейтральное самочувствие";
  }
  return "лучше не перегружаться";
}

function recentWorkoutSessions(sessions: WorkoutSession[], limit = 3): WorkoutSession[] {
  return [...sessions]
    .filter((session) => session.exercises.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export function WorkoutStartCard({ startForm, sessions, isSaving, onChange, onStart }: WorkoutStartCardProps) {
  const previousWeight = latestBodyWeight(sessions);
  const weightDelta = bodyWeightDelta(sessions);
  const sessions30 = countSessionsInPeriod(
    sessions.filter((session) => session.exercises.length > 0),
    30,
  );
  const avgVolume = averageSessionVolume(sessions, 30);
  const daysSince = daysSinceLastWorkout(sessions);
  const lastWorkoutSession = latestWorkoutSession(sessions);
  const recentSessions = useMemo(() => recentWorkoutSessions(sessions), [sessions]);
  const bodyChart = bodyWeightProgressPoints(filterSessionsByPeriod(sessions, 90));

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Шаг 1 · Перед тренировкой</p>
        <CardTitle>Начало тренировки</CardTitle>
        <p className="text-sm capitalize text-muted-foreground">{formatTodayLabel()}</p>
      </CardHeader>

      <CardContent className="space-y-8">
        <section className="space-y-5 rounded-lg border-2 border-primary/25 bg-muted/25 p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold">Перед тренировкой</h2>
            <p className="text-sm text-muted-foreground">Вес и самочувствие — всё в одном месте перед стартом</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
            <div className="flex items-center gap-2 text-sm font-medium shrink-0">
              <Scale className="size-4 text-muted-foreground" aria-hidden="true" />
              Вес тела
            </div>
            <Field className="w-full max-w-[10rem]">
              <FieldLabel htmlFor="body-weight" className="sr-only">
                Вес тела, кг
              </FieldLabel>
              <Input
                id="body-weight"
                inputMode="decimal"
                value={startForm.bodyWeight}
                onChange={(event) => onChange({ bodyWeight: event.target.value })}
                className="text-xl tabular-nums"
                placeholder="76.0"
              />
            </Field>
            {previousWeight ? (
              <p className="text-sm text-muted-foreground sm:pb-2">
                Прошлый раз: {previousWeight.value} кг
                {weightDelta !== null && weightDelta !== 0 ? (
                  <span className={cn("ml-1", weightDelta < 0 ? "text-accent" : "")}>
                    ({formatWeightDelta(weightDelta)})
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="border-t border-border/80 pt-5">
            <h3 className="mb-4 text-sm font-medium">Как себя чувствуешь?</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {METRIC_FIELDS.map(({ key, label, icon, invert }) => (
                <WorkoutMetricSlider
                  key={key}
                  id={key}
                  label={label}
                  value={startForm[key]}
                  invert={invert}
                  icon={icon}
                  onChange={(nextValue) => onChange({ [key]: nextValue })}
                />
              ))}
            </div>
          </div>

          <div className="rounded-md bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            Итого:{" "}
            <span className="font-medium text-foreground">{readinessSummaryLabel(startForm)}</span>
            {lastWorkoutSession ? (
              <>
                {" "}
                · на прошлой: {sessionPreviewLabel(lastWorkoutSession)}
              </>
            ) : null}
          </div>

          <Button className="w-full" size="lg" onClick={onStart} disabled={isSaving}>
            {isSaving ? "Сохранение" : "Начать тренировку"}
          </Button>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Контекст</h3>

          <div className="grid grid-cols-3 gap-2">
            <KpiTile label="За 30 дней" value={String(sessions30)} hint="тренировок" muted />
            <KpiTile
              label="Средний объём"
              value={avgVolume !== null ? formatVolume(avgVolume) : "—"}
              hint="за 30 дней"
              muted
            />
            <KpiTile
              label="Последняя"
              value={daysSince !== null ? formatDaysSince(daysSince) : "—"}
              hint="тренировка"
              muted
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden="true" />
                Недавние тренировки
              </div>
              {recentSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пока нет сохранённых тренировок с упражнениями.</p>
              ) : (
                <div className="space-y-2">
                  {recentSessions.map((session) => (
                    <div key={session.id} className="rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm">
                      <div className="font-medium">{formatDate(session.date)}</div>
                      <div className="text-muted-foreground">
                        {sessionPreviewLabel(session)} · {formatVolume(sessionTotalVolume(session.exercises))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="size-4" aria-hidden="true" />
                Вес за 90 дней
              </div>
              <BodyWeightChart data={bodyChart} heightClassName="h-40 lg:h-44" />
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function KpiTile({
  label,
  value,
  hint,
  muted = false,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-center",
        muted ? "border-border/60 bg-muted/10" : "border-border bg-muted/30",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
