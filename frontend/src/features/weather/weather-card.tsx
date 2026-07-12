"use client";

import { ChevronRight } from "lucide-react";

import { formatTemperature, getWeatherCodeInfo } from "@/features/weather/weather-codes";
import type { WeatherSummary } from "@/features/weather/weather-types";
import { cn } from "@/lib/utils";

type WeatherCardProps = {
  summary: WeatherSummary;
  onOpen: () => void;
  className?: string;
};

export function WeatherCard({ summary, onOpen, className }: WeatherCardProps) {
  const { labelRu, Icon } = getWeatherCodeInfo(summary.current.weatherCode);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "weather-card focus-ring group flex w-full flex-col p-4 text-left transition hover:border-[var(--weather-accent)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--weather-foreground)]">{summary.cityLabel}</p>
          <p className="mt-1 text-xs text-[var(--weather-muted)]">{labelRu}</p>
        </div>
        <Icon className="size-8 shrink-0 text-[var(--weather-accent)]" aria-hidden="true" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-[var(--weather-foreground)]">
            {formatTemperature(summary.current.temperature)}
          </p>
          <p className="mt-1 text-sm text-[var(--weather-muted)]">
            ощущается {formatTemperature(summary.current.apparentTemperature)}
          </p>
        </div>
        <ChevronRight
          className="size-5 shrink-0 text-[var(--weather-muted)] transition group-hover:text-[var(--weather-foreground)]"
          aria-hidden="true"
        />
      </div>

      <p className="mt-4 text-xs text-[var(--weather-muted)]">
        Ветер {Math.round(summary.current.windSpeed)} км/ч · Влажность {Math.round(summary.current.humidity)}%
      </p>
    </button>
  );
}
