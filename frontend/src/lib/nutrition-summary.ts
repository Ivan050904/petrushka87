import { getNumber, getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";

export type NutritionSummary = {
  meals: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export function foodEntryDate(entry: Entry) {
  const raw = getString(entry.metadata.entry_date) || getString(entry.metadata.consumed_at) || entry.created_at;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date(entry.created_at) : date;
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function buildNutritionSummary(entries: Entry[], reference = new Date()): NutritionSummary {
  return entries.reduce(
    (summary, entry) => {
      if (entry.type !== "food" || !isSameDay(foodEntryDate(entry), reference)) {
        return summary;
      }
      return {
        meals: summary.meals + 1,
        calories: summary.calories + getNumber(entry.metadata.calories, getNumber(entry.metadata.kcal)),
        protein: summary.protein + getNumber(entry.metadata.protein, getNumber(entry.metadata.proteins)),
        fat: summary.fat + getNumber(entry.metadata.fat, getNumber(entry.metadata.fats)),
        carbs: summary.carbs + getNumber(entry.metadata.carbs, getNumber(entry.metadata.carbohydrates)),
      };
    },
    { meals: 0, calories: 0, protein: 0, fat: 0, carbs: 0 },
  );
}
