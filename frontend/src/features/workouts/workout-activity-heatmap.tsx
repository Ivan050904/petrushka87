"use client";

import { type WorkoutActivityDay } from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WorkoutActivityHeatmapProps = {
  days: WorkoutActivityDay[];
  workoutCount: number;
};

function volumeIntensity(volume: number, maxVolume: number): string {
  if (volume <= 0) {
    return "border-border bg-transparent";
  }
  if (maxVolume <= 0) {
    return "border-accent/60 bg-accent/40";
  }
  const ratio = volume / maxVolume;
  if (ratio >= 0.75) {
    return "border-accent bg-accent";
  }
  if (ratio >= 0.4) {
    return "border-accent/70 bg-accent/70";
  }
  return "border-accent/50 bg-accent/40";
}

export function WorkoutActivityHeatmap({ days, workoutCount }: WorkoutActivityHeatmapProps) {
  const maxVolume = Math.max(...days.map((day) => day.volume), 0);
  const columns = Math.ceil(days.length / 7);

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        {workoutCount > 0
          ? `${workoutCount} ${workoutCount === 1 ? "тренировка" : workoutCount < 5 ? "тренировки" : "тренировок"} за ${days.length} дней`
          : `Нет тренировок за ${days.length} дней`}
      </p>
      <div
        className="grid grid-flow-col grid-rows-7 gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(10px, 1fr))` }}
        aria-label="Календарь активности в зале"
      >
        {days.map((day) => (
          <span
            key={day.key}
            title={
              day.hasWorkout
                ? `${day.key}: ${Math.round(day.volume).toLocaleString("ru-RU")} кг·повт`
                : `${day.key}: без тренировки`
            }
            className={cn("size-3 rounded-sm border sm:size-3.5", volumeIntensity(day.volume, maxVolume))}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-border bg-transparent" /> отдых
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-accent/50 bg-accent/40" /> лёгкая
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm border border-accent bg-accent" /> интенсивная
        </span>
      </div>
    </div>
  );
}
