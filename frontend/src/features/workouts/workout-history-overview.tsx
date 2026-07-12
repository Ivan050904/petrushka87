"use client";

import {
  Activity,
  BarChart3,
  Flame,
  Scale,
  Trophy,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutActivityHeatmap } from "@/features/workouts/workout-activity-heatmap";
import { BodyWeightChart } from "@/features/workouts/workout-chart";
import { WorkoutLastSessionHero } from "@/features/workouts/workout-last-session-hero";
import { WorkoutMuscleVolumeChart } from "@/features/workouts/workout-muscle-volume-chart";
import { WorkoutProgressPreview } from "@/features/workouts/workout-progress-preview";
import { WorkoutReadinessStrip } from "@/features/workouts/workout-readiness-strip";
import { WorkoutWeeklyVolumeChart } from "@/features/workouts/workout-weekly-volume-chart";
import {
  averageSessionVolume,
  bodyWeightDelta,
  bodyWeightProgressPoints,
  bodyWeightStatsInPeriod,
  filterSessionsByPeriod,
  formatVolume,
  latestBodyWeight,
  latestWorkoutSession,
  readinessTrendPoints,
  type ExerciseCatalogItem,
  type PersonalRecord,
  type ProgressPoint,
  volumeByMuscleGroup,
  weeklyVolumePoints,
  workoutActivityHeatmap,
  workoutStreak,
  type WorkoutSession,
} from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WorkoutHistoryOverviewProps = {
  sessions: WorkoutSession[];
  records: PersonalRecord[];
  catalog: ExerciseCatalogItem[];
  exerciseChart: ProgressPoint[];
  chartExerciseId: string;
  onShowAllSessions: () => void;
  onShowProgress: () => void;
  onStartWorkout: () => void;
};

function formatDelta(value: number, unit: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${sign}${formatted} ${unit}`;
}

export function WorkoutHistoryOverview({
  sessions,
  records,
  catalog,
  exerciseChart,
  chartExerciseId,
  onShowAllSessions,
  onShowProgress,
  onStartWorkout,
}: WorkoutHistoryOverviewProps) {
  const latestWeight = latestBodyWeight(sessions);
  const weightDelta = bodyWeightDelta(sessions);
  const sessions30 = filterSessionsByPeriod(sessions, 30).filter((session) => session.exercises.length > 0);
  const avgVolume = averageSessionVolume(sessions, 30);
  const bodyStats = bodyWeightStatsInPeriod(sessions, 30);
  const bodyChart = bodyWeightProgressPoints(filterSessionsByPeriod(sessions, 90));
  const heatmapDays = workoutActivityHeatmap(sessions, 90);
  const workoutCount = heatmapDays.filter((day) => day.hasWorkout).length;
  const streak = workoutStreak(sessions);
  const muscleShares = volumeByMuscleGroup(sessions, 30);
  const weeklyPoints = weeklyVolumePoints(sessions, 8);
  const readinessTrend = readinessTrendPoints(sessions, 30);
  const latestSession = latestWorkoutSession(sessions);
  const earlierSessions = [...sessions]
    .filter((session) => session.exercises.length > 0 && session.id !== latestSession?.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          icon={Scale}
          label="Вес тела"
          value={latestWeight ? `${latestWeight.value} кг` : "—"}
          hint={weightDelta !== null ? formatDelta(weightDelta, "кг") : undefined}
          hintAccent={weightDelta !== null && weightDelta < 0}
        />
        <KpiTile
          icon={Activity}
          label="За 30 дней"
          value={String(sessions30.length)}
          hint="тренировок"
        />
        <KpiTile
          icon={TrendingUp}
          label="Средний объём"
          value={avgVolume !== null ? formatVolume(avgVolume) : "—"}
          hint="за 30 дней"
        />
        <KpiTile icon={Trophy} label="Рекордов" value={String(records.length)} hint="в таблице PR" />
        <KpiTile icon={Flame} label="Серия" value={String(streak.current)} hint={`лучшая: ${streak.best}`} />
        <KpiTile
          icon={BarChart3}
          label="За 90 дней"
          value={String(workoutCount)}
          hint="тренировок"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4" />
              Вес тела
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bodyStats ? (
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>
                  min <span className="font-medium text-foreground">{bodyStats.min} кг</span>
                </span>
                <span>
                  max <span className="font-medium text-foreground">{bodyStats.max} кг</span>
                </span>
                {bodyStats.delta !== null ? (
                  <span>
                    Δ <span className="font-medium text-foreground">{formatDelta(bodyStats.delta, "кг")}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
            <BodyWeightChart data={bodyChart} heightClassName="h-64 xl:h-72" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4" />
              Объём по неделям
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkoutWeeklyVolumeChart points={weeklyPoints} />
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium">По группам мышц (30 дней)</p>
              <WorkoutMuscleVolumeChart shares={muscleShares} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Активность за 90 дней</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkoutActivityHeatmap days={heatmapDays} workoutCount={workoutCount} />
          </CardContent>
        </Card>

        <WorkoutLastSessionHero
          session={latestSession}
          earlierSessions={earlierSessions}
          sessions={sessions}
          onShowAllSessions={onShowAllSessions}
          onStartWorkout={onStartWorkout}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Самочувствие</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkoutReadinessStrip session={latestSession} trend={readinessTrend} />
          </CardContent>
        </Card>

        <WorkoutProgressPreview
          catalog={catalog}
          exerciseChart={exerciseChart}
          chartExerciseId={chartExerciseId}
          onShowProgress={onShowProgress}
          onStartWorkout={onStartWorkout}
        />
      </div>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  hintAccent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  hintAccent?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5")}>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
      {hint ? (
        <div className={cn("mt-0.5 text-xs text-muted-foreground", hintAccent && "font-medium text-accent")}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
