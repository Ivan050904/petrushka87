"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

function readCssHslVar(name: string, fallback: string) {
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `hsl(${raw})` : fallback;
}

export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState({
    expense: "hsl(0 72% 48%)",
    income: "hsl(152 55% 38%)",
    balance: "hsl(217 91% 53%)",
    bar: "hsl(215 16% 47%)",
    primary: "hsl(217 91% 53%)",
  });

  useEffect(() => {
    setColors({
      expense: readCssHslVar("--chart-expense", colors.expense),
      income: readCssHslVar("--chart-income", colors.income),
      balance: readCssHslVar("--chart-balance", colors.balance),
      bar: readCssHslVar("--chart-bar", colors.bar),
      primary: readCssHslVar("--primary", colors.primary),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when theme class changes
  }, [resolvedTheme]);

  return colors;
}
