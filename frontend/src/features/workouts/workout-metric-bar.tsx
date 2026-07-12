"use client";

import { cn } from "@/lib/utils";

type WorkoutMetricBarProps = {
  label: string;
  value: number;
  invert?: boolean;
};

export function WorkoutMetricBar({ label, value, invert = false }: WorkoutMetricBarProps) {
  const safeValue = Math.max(1, Math.min(10, value));
  const widthPercent = safeValue * 10;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{safeValue}/10</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", invert ? "bg-destructive/50" : "bg-primary/60")}
          style={{ width: `${widthPercent}%` }}
          role="progressbar"
          aria-valuenow={safeValue}
          aria-valuemin={1}
          aria-valuemax={10}
          aria-label={label}
        />
      </div>
    </div>
  );
}
