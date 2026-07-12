import { describe, expect, it } from "vitest";

import { formatTemperature, getWeatherCodeInfo } from "@/features/weather/weather-codes";

describe("weather-codes", () => {
  it("maps clear weather", () => {
    expect(getWeatherCodeInfo(0).labelRu).toBe("Ясно");
  });

  it("maps rain weather", () => {
    expect(getWeatherCodeInfo(61).labelRu).toBe("Дождь");
  });

  it("maps snow weather", () => {
    expect(getWeatherCodeInfo(71).labelRu).toBe("Снег");
  });

  it("maps thunderstorm weather", () => {
    expect(getWeatherCodeInfo(95).labelRu).toBe("Гроза");
  });

  it("formats positive and negative temperatures", () => {
    expect(formatTemperature(5)).toBe("+5°");
    expect(formatTemperature(-3)).toBe("-3°");
  });
});
