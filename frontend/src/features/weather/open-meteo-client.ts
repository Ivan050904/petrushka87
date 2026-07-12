import { getWeatherCity, WEATHER_CITIES } from "@/features/weather/weather-cities";
import type {
  OpenMeteoForecastResponse,
  WeatherCacheEntry,
  WeatherCacheMode,
  WeatherCurrent,
  WeatherDailyEntry,
  WeatherDetail,
  WeatherHourlyEntry,
  WeatherSummary,
} from "@/features/weather/weather-types";
import type { WeatherCityId } from "@/lib/navigation";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_PROXY_URL = "/api/weather/forecast";
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_PREFIX = "folio_weather";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FETCH_ATTEMPTS = 3;
const REQUEST_GAP_MS = 250;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildForecastUrl(searchParams: URLSearchParams) {
  const query = searchParams.toString();
  if (typeof window === "undefined") {
    return `${OPEN_METEO_BASE_URL}?${query}`;
  }
  return `${OPEN_METEO_PROXY_URL}?${query}`;
}

function cacheKey(cityId: WeatherCityId, mode: WeatherCacheMode) {
  return `${CACHE_PREFIX}:${mode}:${cityId}`;
}

function readCache<T>(cityId: WeatherCityId, mode: WeatherCacheMode): T | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(cacheKey(cityId, mode));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as WeatherCacheEntry<T>;
    if (Date.now() - parsed.storedAt > CACHE_TTL_MS) {
      window.sessionStorage.removeItem(cacheKey(cityId, mode));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache<T>(cityId: WeatherCityId, mode: WeatherCacheMode, data: T) {
  if (typeof window === "undefined") {
    return;
  }
  const entry: WeatherCacheEntry<T> = {
    storedAt: Date.now(),
    data,
  };
  window.sessionStorage.setItem(cacheKey(cityId, mode), JSON.stringify(entry));
}

export function clearWeatherCache(cityId?: WeatherCityId) {
  if (typeof window === "undefined") {
    return;
  }
  if (cityId) {
    window.sessionStorage.removeItem(cacheKey(cityId, "summary"));
    window.sessionStorage.removeItem(cacheKey(cityId, "detail"));
    return;
  }
  for (const key of Object.keys(window.sessionStorage)) {
    if (key.startsWith(`${CACHE_PREFIX}:`)) {
      window.sessionStorage.removeItem(key);
    }
  }
}

function parseCurrent(current: NonNullable<OpenMeteoForecastResponse["current"]>): WeatherCurrent {
  return {
    time: current.time,
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    weatherCode: current.weather_code,
    windSpeed: current.wind_speed_10m,
    humidity: current.relative_humidity_2m,
    precipitation: current.precipitation,
    isDay: current.is_day === 1,
  };
}

function parseDailyEntries(daily: NonNullable<OpenMeteoForecastResponse["daily"]>): WeatherDailyEntry[] {
  return daily.time.map((date, index) => ({
    date,
    weatherCode: daily.weather_code[index] ?? 0,
    tempMax: daily.temperature_2m_max[index] ?? 0,
    tempMin: daily.temperature_2m_min[index] ?? 0,
    apparentMax: daily.apparent_temperature_max[index] ?? 0,
    apparentMin: daily.apparent_temperature_min[index] ?? 0,
    precipitationSum: daily.precipitation_sum[index] ?? 0,
    precipitationProbabilityMax: daily.precipitation_probability_max[index] ?? 0,
    windSpeedMax: daily.wind_speed_10m_max[index] ?? 0,
  }));
}

function parseHourlyEntries(hourly: NonNullable<OpenMeteoForecastResponse["hourly"]>): WeatherHourlyEntry[] {
  return hourly.time.map((time, index) => ({
    time,
    temperature: hourly.temperature_2m[index] ?? 0,
    apparentTemperature: hourly.apparent_temperature[index] ?? 0,
    weatherCode: hourly.weather_code[index] ?? 0,
    precipitationProbability: hourly.precipitation_probability[index] ?? 0,
    precipitation: hourly.precipitation[index] ?? 0,
  }));
}

function splitDailyEntries(entries: WeatherDailyEntry[], today: string) {
  const pastDays: WeatherDailyEntry[] = [];
  const forecastDays: WeatherDailyEntry[] = [];

  for (const entry of entries) {
    if (entry.date < today) {
      pastDays.push(entry);
      continue;
    }
    forecastDays.push(entry);
  }

  return {
    pastDays,
    forecastDays: forecastDays.filter((entry) => entry.date > today),
    todayEntry: forecastDays.find((entry) => entry.date === today) ?? null,
  };
}

function filterHourlyToday(entries: WeatherHourlyEntry[], today: string) {
  return entries.filter((entry) => entry.time.startsWith(today));
}

async function fetchOpenMeteo(cityId: WeatherCityId, params: Record<string, string>) {
  const city = getWeatherCity(cityId);
  const searchParams = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    timezone: city.timezone,
    ...params,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(buildForecastUrl(searchParams), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const payload = (await response.json()) as OpenMeteoForecastResponse & {
        error?: boolean;
        reason?: string;
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.reason ?? `Open-Meteo error: ${response.status}`);
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Open-Meteo request failed");
      if (attempt < MAX_FETCH_ATTEMPTS - 1) {
        await delay(400 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("Open-Meteo request failed");
}

function buildSummary(cityId: WeatherCityId, payload: OpenMeteoForecastResponse): WeatherSummary {
  const city = getWeatherCity(cityId);
  if (!payload.current) {
    throw new Error("Open-Meteo response missing current weather");
  }

  return {
    cityId,
    cityLabel: city.label,
    timezone: payload.timezone,
    fetchedAt: new Date().toISOString(),
    current: parseCurrent(payload.current),
  };
}

function buildDetail(cityId: WeatherCityId, payload: OpenMeteoForecastResponse): WeatherDetail {
  const city = getWeatherCity(cityId);
  if (!payload.current || !payload.daily || !payload.hourly) {
    throw new Error("Open-Meteo response missing detail weather");
  }

  const current = parseCurrent(payload.current);
  const dailyEntries = parseDailyEntries(payload.daily);
  const today = current.time.slice(0, 10);
  const { pastDays, forecastDays } = splitDailyEntries(dailyEntries, today);
  const hourlyToday = filterHourlyToday(parseHourlyEntries(payload.hourly), today);

  return {
    cityId,
    cityLabel: city.label,
    timezone: payload.timezone,
    fetchedAt: new Date().toISOString(),
    current,
    hourlyToday,
    forecastDays,
    pastDays,
  };
}

export async function fetchWeatherSummary(
  cityId: WeatherCityId,
  options?: { force?: boolean },
): Promise<WeatherSummary> {
  if (!options?.force) {
    const cached = readCache<WeatherSummary>(cityId, "summary");
    if (cached) {
      return cached;
    }
  }

  const payload = await fetchOpenMeteo(cityId, {
    current:
      "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation,is_day",
  });
  const summary = buildSummary(cityId, payload);
  writeCache(cityId, "summary", summary);
  return summary;
}

export async function fetchAllWeatherSummaries(options?: {
  force?: boolean;
  onCityLoaded?: (summary: WeatherSummary) => void;
}): Promise<WeatherSummary[]> {
  const summaries: WeatherSummary[] = [];

  for (const city of WEATHER_CITIES) {
    try {
      const summary = await fetchWeatherSummary(city.id, options);
      summaries.push(summary);
      options?.onCityLoaded?.(summary);
    } catch {
      // Continue loading other cities even if one fails.
    }

    if (city.id !== WEATHER_CITIES[WEATHER_CITIES.length - 1]?.id) {
      await delay(REQUEST_GAP_MS);
    }
  }

  if (summaries.length === 0) {
    throw new Error("Не удалось загрузить погоду ни для одного города.");
  }

  return summaries;
}

export async function fetchWeatherDetail(
  cityId: WeatherCityId,
  options?: { force?: boolean },
): Promise<WeatherDetail> {
  if (!options?.force) {
    const cached = readCache<WeatherDetail>(cityId, "detail");
    if (cached) {
      return cached;
    }
  }

  const payload = await fetchOpenMeteo(cityId, {
    current:
      "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation,is_day",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    hourly: "temperature_2m,apparent_temperature,weather_code,precipitation_probability,precipitation",
    forecast_days: "7",
    past_days: "7",
  });
  const detail = buildDetail(cityId, payload);
  writeCache(cityId, "detail", detail);
  return detail;
}

export function formatWeatherDate(date: string, timezone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    ...options,
  }).format(new Date(`${date}T12:00:00`));
}

export function formatWeatherTime(time: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}
