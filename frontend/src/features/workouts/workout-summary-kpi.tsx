"use client";

import { CheckCircle2 } from "lucide-react";

import { WorkoutMetricBar } from "@/features/workouts/workout-metric-bar";
import { formatVolume, type WorkoutStartForm } from "@/lib/workouts";

type WorkoutSummaryKpiProps = {
  sessionDate: string;
  startForm: WorkoutStartForm;
  exerciseCount: number;
  volume: number;
};

const METRIC_FIELDS = [
  { key: "mood" as const, label: "Настроение" },
  { key: "muscleReadiness" as const, label: "Готовность мышц" },
  { key: "sleepQuality" as const, label: "Качество сна" },
  { key: "generalFatigue" as const, label: "Общая усталость", invert: true },
];

function formatSessionDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

export function WorkoutSummaryKpi({ sessionDate, startForm, exerciseCount, volume }: WorkoutSummaryKpiProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">Тренировка завершена</h2>
          <p className="text-sm text-muted-foreground">
            {formatSessionDate(sessionDate)} · {exerciseCount} упражн. · {formatVolume(volume)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
          <div className="text-xs text-muted-foreground">Вес тела</div>
          <div className="text-base font-semibold tabular-nums">{startForm.bodyWeight} кг</div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
          <div className="text-xs text-muted-foreground">Упражнений</div>
          <div className="text-base font-semibold tabular-nums">{exerciseCount}</div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
          <div className="text-xs text-muted-foreground">Объём</div>
          <div className="text-base font-semibold tabular-nums">{Math.round(volume).toLocaleString("ru-RU")}</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {METRIC_FIELDS.map(({ key, label, invert }) => (
          <WorkoutMetricBar key={key} label={label} value={startForm[key]} invert={invert} />
        ))}
      </div>
    </div>
  );
}
