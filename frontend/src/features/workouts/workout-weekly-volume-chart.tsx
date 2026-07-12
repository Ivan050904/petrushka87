"use client";

import { formatChartDate, formatVolume, type WeeklyVolumePoint } from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WorkoutWeeklyVolumeChartProps = {
  points: WeeklyVolumePoint[];
};

export function WorkoutWeeklyVolumeChart({ points }: WorkoutWeeklyVolumeChartProps) {
  const weeksWithData = points.filter((point) => point.volume > 0).length;
  const maxVolume = Math.max(...points.map((point) => point.volume), 0);

  if (weeksWithData < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Нужно ≥2 недели с тренировками для тренда объёма. Сейчас: {weeksWithData}.
      </p>
    );
  }

  return (
    <div className="flex h-48 items-end gap-2">
      {points.map((point) => {
        const heightPercent = maxVolume > 0 ? Math.max(6, (point.volume / maxVolume) * 100) : 6;
        return (
          <div key={point.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground tabular-nums sm:text-xs">
              {point.volume > 0 ? formatVolume(point.volume).replace(" кг·повт", "") : "—"}
            </span>
            <div
              className={cn(
                "w-full rounded-t-md transition-all",
                point.volume > 0 ? "bg-primary/70" : "bg-muted",
              )}
              style={{ height: `${heightPercent}%` }}
              title={`${formatChartDate(point.weekStart)}: ${formatVolume(point.volume)}`}
            />
            <span className="truncate text-[10px] text-muted-foreground sm:text-xs">
              {formatChartDate(point.weekStart)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
