"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import {
  clearWeatherCache,
  fetchAllWeatherSummaries,
  fetchWeatherDetail,
} from "@/features/weather/open-meteo-client";
import { WeatherCard } from "@/features/weather/weather-card";
import { WeatherCardSkeleton } from "@/features/weather/weather-card-skeleton";
import { WeatherCityDetail } from "@/features/weather/weather-city-detail";
import { WEATHER_CITIES } from "@/features/weather/weather-cities";
import type { WeatherDetail, WeatherSummary } from "@/features/weather/weather-types";
import { getErrorMessage } from "@/lib/api";
import { parseWeatherCityId, weatherHref } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function WeatherView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cityId = parseWeatherCityId(searchParams.get("city"));

  const [summaries, setSummaries] = useState<WeatherSummary[]>([]);
  const [detail, setDetail] = useState<WeatherDetail | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [isRefreshingDetail, setIsRefreshingDetail] = useState(false);

  const loadSummaries = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    if (force) {
      setIsRefreshingList(true);
    } else {
      setIsListLoading(true);
      setSummaries([]);
    }
    setListError(null);

    try {
      const nextSummaries = await fetchAllWeatherSummaries({
        force,
        onCityLoaded: (summary) => {
          setSummaries((current) => {
            if (current.some((item) => item.cityId === summary.cityId)) {
              return current;
            }
            return [...current, summary];
          });
        },
      });
      setSummaries(nextSummaries);
    } catch (error) {
      setListError(getErrorMessage(error, "Не удалось загрузить погоду."));
    } finally {
      setIsListLoading(false);
      setIsRefreshingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (selectedCityId: NonNullable<typeof cityId>, options?: { force?: boolean }) => {
    const force = options?.force ?? false;
    if (force) {
      setIsRefreshingDetail(true);
    } else {
      setIsDetailLoading(true);
    }
    setDetailError(null);

    try {
      const nextDetail = await fetchWeatherDetail(selectedCityId, { force });
      setDetail(nextDetail);
    } catch (error) {
      setDetailError(getErrorMessage(error, "Не удалось загрузить прогноз."));
    } finally {
      setIsDetailLoading(false);
      setIsRefreshingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (cityId) {
      return;
    }
    void loadSummaries();
  }, [cityId, loadSummaries]);

  useEffect(() => {
    if (!cityId) {
      setDetail(null);
      return;
    }
    void loadDetail(cityId);
  }, [cityId, loadDetail]);

  function openCity(nextCityId: NonNullable<typeof cityId>) {
    router.push(weatherHref(nextCityId));
  }

  function handleBack() {
    router.push(weatherHref());
  }

  function handleRefreshList() {
    clearWeatherCache();
    void loadSummaries({ force: true });
  }

  function handleRefreshDetail() {
    if (!cityId) {
      return;
    }
    clearWeatherCache(cityId);
    void loadDetail(cityId, { force: true });
  }

  if (cityId) {
    if (isDetailLoading && !detail) {
      return (
        <div className="weather-surface flex min-h-0 flex-1 items-center justify-center px-6 py-16 text-sm text-[var(--weather-muted)]">
          Загружаем прогноз...
        </div>
      );
    }

    if (detailError && !detail) {
      return (
        <div className="weather-surface flex min-h-0 flex-1 flex-col px-4 py-8 lg:px-6">
          <LoadError message={detailError} onRetry={() => void loadDetail(cityId, { force: true })} />
          <Button type="button" variant="ghost" className="mt-4 self-start" onClick={handleBack}>
            К списку
          </Button>
        </div>
      );
    }

    if (detail) {
      return (
        <WeatherCityDetail
          detail={detail}
          isRefreshing={isRefreshingDetail}
          onBack={handleBack}
          onRefresh={handleRefreshDetail}
        />
      );
    }

    return null;
  }

  return (
    <div className="weather-surface flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[var(--weather-border)] px-3 py-3 lg:px-6 lg:py-4">
        <div className="flex items-end justify-between gap-3">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-semibold text-[var(--weather-foreground)]">Погода</h1>
            <p className="mt-1 text-sm text-[var(--weather-muted)]">
              {WEATHER_CITIES.length} городов · Open-Meteo
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleRefreshList} disabled={isRefreshingList}>
            <RefreshCw className={cn("size-4", isRefreshingList && "animate-spin")} />
            Обновить
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-[env(safe-area-inset-bottom)] lg:px-6">
        {listError ? (
          <div className="mb-4">
            <LoadError message={listError} onRetry={() => void loadSummaries({ force: true })} />
          </div>
        ) : null}

        {isListLoading && summaries.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {WEATHER_CITIES.map((city) => (
              <WeatherCardSkeleton key={city.id} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {summaries.map((summary) => (
              <WeatherCard key={summary.cityId} summary={summary} onOpen={() => openCity(summary.cityId)} />
            ))}
            {isListLoading || isRefreshingList
              ? WEATHER_CITIES.filter((city) => !summaries.some((summary) => summary.cityId === city.id)).map(
                  (city) => <WeatherCardSkeleton key={city.id} />,
                )
              : null}
          </div>
        )}
      </div>
    </div>
  );
}
