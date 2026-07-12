import { DEFAULT_SET_COUNT, buildSetRows, type WorkoutSet } from "@/lib/workouts";

export type SetRow = WorkoutSet & { key: string };

export function rowsWithKeys(sets: WorkoutSet[]): SetRow[] {
  return sets.map((set) => ({ ...set, key: crypto.randomUUID() }));
}

export function parseSetCount(value: string): number {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SET_COUNT;
  }
  return Math.max(1, Math.min(parsed, 20));
}

export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type WizardStep = "start" | "workout" | "summary";
