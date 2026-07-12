"use client";

import { formatMuscleGroup, formatVolume, type MuscleVolumeShare } from "@/lib/workouts";

type WorkoutMuscleVolumeChartProps = {
  shares: MuscleVolumeShare[];
  periodLabel?: string;
};

export function WorkoutMuscleVolumeChart({ shares, periodLabel = "30 дней" }: WorkoutMuscleVolumeChartProps) {
  if (shares.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Нет данных по группам мышц за {periodLabel}. Добавь упражнения в тренировки.
      </p>
    );
  }

  const maxVolume = shares[0]?.volume ?? 1;

  return (
    <div className="space-y-3">
      {shares.map((share) => (
        <div key={share.group} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{formatMuscleGroup(share.group)}</span>
            <span className="text-muted-foreground tabular-nums">
              {share.percent}% · {formatVolume(share.volume)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70 transition-all"
              style={{ width: `${Math.max(8, (share.volume / maxVolume) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
