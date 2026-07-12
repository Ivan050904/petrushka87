"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";

import {
  formatWeatherDate,
  formatWeatherTime,
} from "@/features/weather/open-meteo-client";
import {
  formatTemperature,
  formatTemperatureRange,
  getWeatherCodeInfo,
} from "@/features/weather/weather-codes";
import type { WeatherDailyEntry, WeatherDetail } from "@/features/weather/weather-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WeatherCityDetailProps = {
  detail: WeatherDetail;
  isRefreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
};

export function WeatherCityDetail({ detail, isRefreshing, onBack, onRefresh }: WeatherCityDetailProps) {
  const { labelRu, Icon } = getWeatherCodeInfo(detail.current.weatherCode);

  return (
    <div className="weather-surface flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--weather-border)] px-3 py-2 lg:px-6 lg:py-3">
        <button
          type="button"
          onClick={onBack}
          className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-full px-2 py-1 text-sm text-[var(--weather-muted)]"
        >
          <ArrowLeft className="size-4" />
          К списку
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          Обновить
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-[env(safe-area-inset-bottom)] lg:px-6">
        <section className="weather-panel p-4 lg:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--weather-foreground)]">{detail.cityLabel}</h2>
              <p className="mt-1 text-sm text-[var(--weather-muted)]">{labelRu}</p>
            </div>
            <Icon className="size-12 text-[var(--weather-accent)]" aria-hidden="true" />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-4xl font-semibold tracking-tight text-[var(--weather-foreground)]">
                {formatTemperature(detail.current.temperature)}
              </p>
              <p className="mt-1 text-sm text-[var(--weather-muted)]">
                ощущается {formatTemperature(detail.current.apparentTemperature)}
              </p>
            </div>
            <dl className="grid gap-2 text-sm text-[var(--weather-muted)]">
              <div className="flex justify-between gap-3">
                <dt>Ветер</dt>
                <dd className="text-[var(--weather-foreground)]">{Math.round(detail.current.windSpeed)} км/ч</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Влажность</dt>
                <dd className="text-[var(--weather-foreground)]">{Math.round(detail.current.humidity)}%</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Осадки сейчас</dt>
                <dd className="text-[var(--weather-foreground)]">{detail.current.precipitation.toFixed(1)} мм</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--weather-foreground)]">Сегодня по часам</h3>
          {detail.hourlyToday.length === 0 ? (
            <p className="text-sm text-[var(--weather-muted)]">Почасовой прогноз недоступен.</p>
          ) : (
            <div className="scrollbar-hidden flex gap-2 overflow-x-auto pb-1">
              {detail.hourlyToday.map((hour) => {
                const hourInfo = getWeatherCodeInfo(hour.weatherCode);
                const HourIcon = hourInfo.Icon;
                return (
                  <div key={hour.time} className="weather-hour-card min-w-[5.5rem] shrink-0 p-3 text-center">
                    <p className="text-xs text-[var(--weather-muted)]">
                      {formatWeatherTime(hour.time, detail.timezone)}
                    </p>
                    <HourIcon className="mx-auto mt-2 size-5 text-[var(--weather-accent)]" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-[var(--weather-foreground)]">
                      {formatTemperature(hour.temperature)}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--weather-muted)]">
                      {hour.precipitationProbability > 0 ? `${Math.round(hour.precipitationProbability)}%` : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-[var(--weather-foreground)]">7 дней вперёд</h3>
          <div className="space-y-2">
            {detail.forecastDays.length === 0 ? (
              <p className="text-sm text-[var(--weather-muted)]">Прогноз недоступен.</p>
            ) : (
              detail.forecastDays.map((day) => (
                <WeatherDailyRow key={day.date} day={day} timezone={detail.timezone} />
              ))
            )}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--weather-foreground)]">Прошлая неделя</h3>
            <p className="text-xs text-[var(--weather-muted)]">архив Open-Meteo</p>
          </div>
          <div className="space-y-2">
            {detail.pastDays.length === 0 ? (
              <p className="text-sm text-[var(--weather-muted)]">Архив недоступен.</p>
            ) : (
              detail.pastDays.map((day) => (
                <WeatherDailyRow key={day.date} day={day} timezone={detail.timezone} muted />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function WeatherDailyRow({
  day,
  timezone,
  muted = false,
}: {
  day: WeatherDailyEntry;
  timezone: string;
  muted?: boolean;
}) {
  const { labelRu, Icon } = getWeatherCodeInfo(day.weatherCode);

  return (
    <div className={cn("weather-panel flex items-center gap-3 p-3", muted && "opacity-90")}>
      <div className="min-w-[4.5rem]">
        <p className="text-sm font-medium text-[var(--weather-foreground)]">
          {formatWeatherDate(day.date, timezone, { weekday: "short", day: "numeric", month: "short" })}
        </p>
      </div>
      <Icon className="size-5 shrink-0 text-[var(--weather-accent)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--weather-foreground)]">{labelRu}</p>
        <p className="text-xs text-[var(--weather-muted)]">
          ощущается {formatTemperatureRange(day.apparentMin, day.apparentMax)}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-[var(--weather-foreground)]">
          {formatTemperatureRange(day.tempMin, day.tempMax)}
        </p>
        <p className="text-xs text-[var(--weather-muted)]">
          {day.precipitationSum > 0 ? `${day.precipitationSum.toFixed(1)} мм` : "без осадков"}
          {day.precipitationProbabilityMax > 0 ? ` · ${Math.round(day.precipitationProbabilityMax)}%` : ""}
        </p>
      </div>
    </div>
  );
}
