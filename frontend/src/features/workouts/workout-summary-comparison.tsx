"use client";

import { type SessionComparison } from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WorkoutSummaryComparisonProps = {
  comparison: SessionComparison;
};

function formatPreviousDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

function formatDelta(value: number, unit: string): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${sign}${formatted} ${unit}`;
}

export function WorkoutSummaryComparison({ comparison }: WorkoutSummaryComparisonProps) {
  const { previousSession, bodyWeightDelta, volumeDeltaPercent } = comparison;
  if (!previousSession) {
    return null;
  }

  const parts: Array<{ text: string; accent?: boolean }> = [];

  if (bodyWeightDelta !== null && bodyWeightDelta !== 0) {
    parts.push({ text: `вес ${formatDelta(bodyWeightDelta, "кг")}` });
  }

  if (volumeDeltaPercent !== null && volumeDeltaPercent !== 0) {
    parts.push({
      text: `объём ${volumeDeltaPercent > 0 ? "+" : ""}${volumeDeltaPercent}%`,
      accent: volumeDeltaPercent > 0,
    });
  }

  if (parts.length === 0) {
    return (
      <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        vs {formatPreviousDate(previousSession.date)}: без изменений относительно прошлой тренировки
      </p>
    );
  }

  return (
    <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
      <span>vs {formatPreviousDate(previousSession.date)}: </span>
      {parts.map((part, index) => (
        <span key={part.text}>
          {index > 0 ? " · " : null}
          <span className={cn(part.accent && "font-medium text-accent")}>{part.text}</span>
        </span>
      ))}
    </p>
  );
}
