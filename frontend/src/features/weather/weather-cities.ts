import type { WeatherCityId } from "@/lib/navigation";

export type WeatherCity = {
  id: WeatherCityId;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export const WEATHER_CITIES: WeatherCity[] = [
  {
    id: "moscow",
    label: "Москва",
    latitude: 55.7558,
    longitude: 37.6173,
    timezone: "Europe/Moscow",
  },
  {
    id: "spb",
    label: "Санкт-Петербург",
    latitude: 59.9343,
    longitude: 30.3351,
    timezone: "Europe/Moscow",
  },
  {
    id: "novosibirsk",
    label: "Новосибирск",
    latitude: 55.0084,
    longitude: 82.9357,
    timezone: "Asia/Novosibirsk",
  },
  {
    id: "vladivostok",
    label: "Владивосток",
    latitude: 43.1155,
    longitude: 131.8855,
    timezone: "Asia/Vladivostok",
  },
  {
    id: "norilsk",
    label: "Норильск",
    latitude: 69.3558,
    longitude: 88.1893,
    timezone: "Asia/Krasnoyarsk",
  },
];

export function getWeatherCity(cityId: WeatherCityId): WeatherCity {
  const city = WEATHER_CITIES.find((item) => item.id === cityId);
  if (!city) {
    throw new Error(`Unknown weather city: ${cityId}`);
  }
  return city;
}

export function isWeatherCityId(value: string | null): value is WeatherCityId {
  return WEATHER_CITIES.some((city) => city.id === value);
}
