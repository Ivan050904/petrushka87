export type MuscleGroup = "legs" | "shoulders" | "back" | "biceps" | "triceps";

export const MUSCLE_GROUPS: MuscleGroup[] = ["legs", "shoulders", "back", "biceps", "triceps"];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  legs: "Ноги",
  shoulders: "Плечи",
  back: "Спина",
  biceps: "Бицепс",
  triceps: "Трицепс",
};

export type WorkoutSet = {
  weight: number;
  reps: number;
};

export type ExerciseCatalogItem = {
  id: string;
  name: string;
  muscle_group: MuscleGroup;
  created_at: string;
};

export type WorkoutExercise = {
  id: string;
  exercise_catalog_id: string;
  sets: WorkoutSet[];
  exercise_name?: string | null;
  muscle_group?: MuscleGroup | null;
};

export type WorkoutSession = {
  id: string;
  date: string;
  body_weight: number;
  mood: number;
  muscle_readiness: number;
  sleep_quality: number;
  general_fatigue: number;
  created_at: string;
  updated_at: string;
  exercises: WorkoutExercise[];
};

export type WorkoutSessionList = {
  items: WorkoutSession[];
  total: number;
};

export type PersonalRecord = {
  id: string;
  exercise_catalog_id: string;
  weight: number;
  reps: number;
  date: string;
  created_at: string;
  exercise_name?: string | null;
};

export type ProgressPoint = {
  date: string;
  max_weight: number;
};

export function formatMuscleGroup(group: MuscleGroup): string {
  return MUSCLE_GROUP_LABELS[group];
}

export function maxSetWeight(sets: WorkoutSet[]): number | null {
  if (sets.length === 0) {
    return null;
  }
  return Math.max(...sets.map((set) => set.weight));
}

export function emptySetRow(): WorkoutSet {
  return { weight: 0, reps: 0 };
}

export function isSetComplete(set: WorkoutSet): boolean {
  return set.weight > 0 && set.reps > 0;
}

export function filterCompleteSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.filter(isSetComplete);
}

export function buildSetRows(count: number, existing?: WorkoutSet[]): WorkoutSet[] {
  const safeCount = Math.max(1, Math.min(Math.round(count), 20));
  return Array.from({ length: safeCount }, (_, index) => {
    const prior = existing?.[index];
    return prior ? { ...prior } : emptySetRow();
  });
}

export type BodyWeightPoint = {
  date: string;
  body_weight: number;
};

export function bodyWeightProgressPoints(sessions: WorkoutSession[]): BodyWeightPoint[] {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, number>();
  for (const session of sorted) {
    byDate.set(session.date.slice(0, 10), session.body_weight);
  }
  return [...byDate.entries()].map(([date, body_weight]) => ({ date, body_weight }));
}

export const DEFAULT_SET_COUNT = 3;

export type WorkoutStartForm = {
  bodyWeight: string;
  mood: number;
  muscleReadiness: number;
  sleepQuality: number;
  generalFatigue: number;
};

export function defaultWorkoutStartForm(): WorkoutStartForm {
  return {
    bodyWeight: "",
    mood: 5,
    muscleReadiness: 5,
    sleepQuality: 5,
    generalFatigue: 5,
  };
}
