import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "lucide-react";

export type WeatherCodeInfo = {
  labelRu: string;
  Icon: LucideIcon;
};

function info(labelRu: string, Icon: LucideIcon): WeatherCodeInfo {
  return { labelRu, Icon };
}

export function getWeatherCodeInfo(code: number): WeatherCodeInfo {
  if (code === 0) {
    return info("Ясно", Sun);
  }
  if (code === 1) {
    return info("Преимущественно ясно", Sun);
  }
  if (code === 2) {
    return info("Переменная облачность", CloudSun);
  }
  if (code === 3) {
    return info("Облачно", Cloud);
  }
  if (code === 45 || code === 48) {
    return info("Туман", CloudFog);
  }
  if (code >= 51 && code <= 57) {
    return info("Морось", CloudRain);
  }
  if (code >= 61 && code <= 67) {
    return info("Дождь", CloudRain);
  }
  if (code >= 71 && code <= 77) {
    return info("Снег", CloudSnow);
  }
  if (code >= 80 && code <= 82) {
    return info("Ливень", CloudRain);
  }
  if (code >= 85 && code <= 86) {
    return info("Снегопад", CloudSnow);
  }
  if (code >= 95 && code <= 99) {
    return info("Гроза", CloudLightning);
  }
  return info("Неизвестно", Cloud);
}

export function formatTemperature(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}°`;
}

export function formatTemperatureRange(min: number, max: number) {
  return `${formatTemperature(min)} / ${formatTemperature(max)}`;
}
