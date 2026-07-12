"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type WorkoutMetricSliderProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  invert?: boolean;
  icon?: LucideIcon;
};

export function WorkoutMetricSlider({ id, label, value, onChange, invert = false, icon: Icon }: WorkoutMetricSliderProps) {
  const safeValue = Math.max(1, Math.min(10, value));
  const widthPercent = safeValue * 10;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        <label htmlFor={id} className="flex-1 text-sm text-muted-foreground">
          {label}
        </label>
        <span className="text-sm font-medium tabular-nums">{safeValue}/10</span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={10}
        step={1}
        value={safeValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn("workout-range w-full", invert ? "workout-range-invert" : "workout-range-normal")}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={safeValue}
      />
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full transition-all", invert ? "bg-destructive/50" : "bg-primary/60")}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    </div>
  );
}
