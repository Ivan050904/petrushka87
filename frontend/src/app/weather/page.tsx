"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { WeatherView } from "@/features/weather/weather-view";

function WeatherFallback() {
  return (
    <div className="weather-surface flex min-h-0 flex-1 items-center justify-center text-sm text-[var(--weather-muted)]">
      Загружаем погоду...
    </div>
  );
}

export default function WeatherPage() {
  return (
    <AppShell contentClassName="min-h-0 overflow-hidden p-0">
      <Suspense fallback={<WeatherFallback />}>
        <WeatherView />
      </Suspense>
    </AppShell>
  );
}
