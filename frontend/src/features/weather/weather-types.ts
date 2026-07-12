import type { WeatherCityId } from "@/lib/navigation";

export type OpenMeteoCurrent = {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  weather_code: number;
  wind_speed_10m: number;
  relative_humidity_2m: number;
  precipitation: number;
  is_day: number;
};

export type OpenMeteoDaily = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  precipitation_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
};

export type OpenMeteoHourly = {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  weather_code: number[];
  precipitation_probability: number[];
  precipitation: number[];
};

export type OpenMeteoForecastResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  current?: OpenMeteoCurrent;
  daily?: OpenMeteoDaily;
  hourly?: OpenMeteoHourly;
};

export type WeatherCurrent = {
  time: string;
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  precipitation: number;
  isDay: boolean;
};

export type WeatherDailyEntry = {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  apparentMax: number;
  apparentMin: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
};

export type WeatherHourlyEntry = {
  time: string;
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  precipitationProbability: number;
  precipitation: number;
};

export type WeatherSummary = {
  cityId: WeatherCityId;
  cityLabel: string;
  timezone: string;
  fetchedAt: string;
  current: WeatherCurrent;
};

export type WeatherDetail = {
  cityId: WeatherCityId;
  cityLabel: string;
  timezone: string;
  fetchedAt: string;
  current: WeatherCurrent;
  hourlyToday: WeatherHourlyEntry[];
  forecastDays: WeatherDailyEntry[];
  pastDays: WeatherDailyEntry[];
};

export type WeatherCacheMode = "summary" | "detail";

export type WeatherCacheEntry<T> = {
  storedAt: number;
  data: T;
};
