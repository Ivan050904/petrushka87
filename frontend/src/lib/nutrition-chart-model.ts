import type { NutritionTargets } from "@/lib/food-tracking";
import type { NutritionSummary } from "@/lib/nutrition-summary";

const GAP_DEG = 3.2;

export type MacroKey = "protein" | "fat" | "carbs";

export type NutritionChartSegment = {
  key: MacroKey;
  label: string;
  value: number;
  target: number;
  color: string;
  trackColor: string;
  startAngle: number;
  endAngle: number;
  spanDeg: number;
  progress: number;
  displayProgress: number;
  isOver: boolean;
};

export type NutritionChartModel = {
  segments: NutritionChartSegment[];
  isEmpty: boolean;
  caloriesLeft: number;
  caloriesOver: number;
  isCaloriesGoalMet: boolean;
};

export function buildNutritionChartModel(summary: NutritionSummary, targets: NutritionTargets): NutritionChartModel {
  const safeTargets = {
    calories: Math.max(targets.calories, 1),
    protein: Math.max(targets.protein, 1),
    fat: Math.max(targets.fat, 1),
    carbs: Math.max(targets.carbs, 1),
  };

  const defs: {
    key: MacroKey;
    label: string;
    value: number;
    target: number;
    cal: number;
    color: string;
    trackColor: string;
  }[] = [
    {
      key: "protein",
      label: "Белки",
      value: Math.max(0, summary.protein),
      target: safeTargets.protein,
      cal: safeTargets.protein * 4,
      color: "hsl(217 91% 53%)",
      trackColor: "hsl(217 91% 53% / 0.18)",
    },
    {
      key: "fat",
      label: "Жиры",
      value: Math.max(0, summary.fat),
      target: safeTargets.fat,
      cal: safeTargets.fat * 9,
      color: "hsl(43 96% 56%)",
      trackColor: "hsl(43 96% 56% / 0.22)",
    },
    {
      key: "carbs",
      label: "Углеводы",
      value: Math.max(0, summary.carbs),
      target: safeTargets.carbs,
      cal: safeTargets.carbs * 4,
      color: "hsl(350 82% 72%)",
      trackColor: "hsl(350 82% 72% / 0.22)",
    },
  ];

  const totalCal = defs.reduce((sum, item) => sum + item.cal, 0) || 1;
  const usable = 180 - GAP_DEG * (defs.length - 1);
  let cursor = 180;

  const segments = defs.map((item, index) => {
    const span = (item.cal / totalCal) * usable;
    const startAngle = cursor;
    const endAngle = cursor - span;
    cursor = endAngle - (index < defs.length - 1 ? GAP_DEG : 0);
    const progress = item.value / item.target;

    return {
      key: item.key,
      label: item.label,
      value: item.value,
      target: item.target,
      color: item.color,
      trackColor: item.trackColor,
      startAngle,
      endAngle,
      spanDeg: span,
      progress,
      displayProgress: Math.min(1, progress),
      isOver: progress > 1,
    };
  });

  const calories = Math.max(0, summary.calories);
  const caloriesLeft = Math.max(0, safeTargets.calories - calories);
  const caloriesOver = Math.max(0, calories - safeTargets.calories);
  const isEmpty = summary.meals === 0 && calories === 0 && summary.protein === 0 && summary.fat === 0 && summary.carbs === 0;

  return {
    segments,
    isEmpty,
    caloriesLeft,
    caloriesOver,
    isCaloriesGoalMet: !isEmpty && caloriesOver === 0 && caloriesLeft === 0,
  };
}

export function formatMacroGrams(value: number) {
  return `${Math.round(value)}г`;
}

export function formatKcal(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} кКал`;
}
