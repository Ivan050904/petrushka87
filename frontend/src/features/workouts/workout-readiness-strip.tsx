"use client";

import { WorkoutMetricBar } from "@/features/workouts/workout-metric-bar";
import { type ReadinessTrendPoint, type WorkoutSession } from "@/lib/workouts";

type WorkoutReadinessStripProps = {
  session: WorkoutSession | null;
  trend: ReadinessTrendPoint[];
};

const METRIC_FIELDS = [
  { key: "mood" as const, label: "Настроение" },
  { key: "muscle_readiness" as const, label: "Готовность мышц" },
  { key: "sleep_quality" as const, label: "Качество сна" },
  { key: "general_fatigue" as const, label: "Общая усталость", invert: true },
];

export function WorkoutReadinessStrip({ session, trend }: WorkoutReadinessStripProps) {
  if (!session) {
    return <p className="text-sm text-muted-foreground">Нет данных о самочувствии — начни тренировку с оценкой.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {METRIC_FIELDS.map(({ key, label, invert }) => (
          <WorkoutMetricBar key={key} label={label} value={session[key]} invert={invert} />
        ))}
      </div>
      {trend.length >= 2 ? (
        <p className="text-xs text-muted-foreground">
          Тренд по {trend.length} тренировкам: настроение {trend[trend.length - 1]?.mood}/10, сон{" "}
          {trend[trend.length - 1]?.sleep_quality}/10
        </p>
      ) : null}
    </div>
  );
}
