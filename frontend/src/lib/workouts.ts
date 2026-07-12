export type MuscleGroup = "legs" | "shoulders" | "back" | "biceps" | "triceps" | "chest";

export const MUSCLE_GROUPS: MuscleGroup[] = ["legs", "shoulders", "back", "chest", "biceps", "triceps"];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  legs: "Ноги",
  shoulders: "Плечи",
  back: "Спина",
  chest: "Грудь",
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

export type SessionExerciseEntry = {
  exercise_catalog_id: string;
  sets: WorkoutSet[];
  name: string;
  muscle_group: MuscleGroup;
};

export function groupCatalogByMuscle(catalog: ExerciseCatalogItem[]): Record<MuscleGroup, ExerciseCatalogItem[]> {
  const grouped = Object.fromEntries(MUSCLE_GROUPS.map((group) => [group, [] as ExerciseCatalogItem[]])) as Record<
    MuscleGroup,
    ExerciseCatalogItem[]
  >;
  for (const item of catalog) {
    grouped[item.muscle_group].push(item);
  }
  for (const group of MUSCLE_GROUPS) {
    grouped[group].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  return grouped;
}

export function lastSetsForExercise(
  sessions: WorkoutSession[],
  exerciseId: string,
  excludeSessionId?: string | null,
): WorkoutSet[] | null {
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  for (const session of sorted) {
    if (excludeSessionId && session.id === excludeSessionId) {
      continue;
    }
    const match = session.exercises.find((item) => item.exercise_catalog_id === exerciseId);
    if (match && match.sets.length > 0) {
      return match.sets.map((set) => ({ ...set }));
    }
  }
  return null;
}

export function sessionTotalVolume(exercises: Array<{ sets: WorkoutSet[] }>): number {
  return exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.reduce((setTotal, set) => setTotal + set.weight * set.reps, 0),
    0,
  );
}

export function formatSetsSummary(sets: WorkoutSet[]): string {
  return sets.map((set) => `${set.weight}×${set.reps}`).join(" · ");
}

export function isNewPersonalRecord(
  sets: WorkoutSet[],
  records: PersonalRecord[],
  exerciseId: string,
): boolean {
  const currentMax = maxSetWeight(filterCompleteSets(sets));
  if (currentMax === null) {
    return false;
  }
  const exerciseRecords = records.filter((record) => record.exercise_catalog_id === exerciseId);
  if (exerciseRecords.length === 0) {
    return currentMax > 0;
  }
  const recordMax = Math.max(...exerciseRecords.map((record) => record.weight));
  return currentMax > recordMax;
}

export function countSessionExercisesDone(
  sessionExercises: SessionExerciseEntry[],
  catalog: ExerciseCatalogItem[],
): { done: number; total: number } {
  const done = sessionExercises.length;
  const total = catalog.length;
  return { done, total };
}

export function countGroupExercisesDone(
  group: MuscleGroup,
  sessionExercises: SessionExerciseEntry[],
  catalog: ExerciseCatalogItem[],
): { done: number; total: number } {
  const groupCatalog = catalog.filter((item) => item.muscle_group === group);
  const done = sessionExercises.filter((item) => item.muscle_group === group).length;
  return { done, total: groupCatalog.length };
}

export type MuscleGroupSessionBlock = {
  group: MuscleGroup;
  items: SessionExerciseEntry[];
};

export function groupSessionExercisesByMuscle(exercises: SessionExerciseEntry[]): MuscleGroupSessionBlock[] {
  const byGroup = new Map<MuscleGroup, SessionExerciseEntry[]>();
  for (const item of exercises) {
    const list = byGroup.get(item.muscle_group) ?? [];
    list.push(item);
    byGroup.set(item.muscle_group, list);
  }
  return MUSCLE_GROUPS.filter((group) => (byGroup.get(group)?.length ?? 0) > 0).map((group) => ({
    group,
    items: byGroup.get(group) ?? [],
  }));
}

export function formatVolume(volume: number): string {
  return `${Math.round(volume).toLocaleString("ru-RU")} кг·повт`;
}

export function findPreviousSession(
  sessions: WorkoutSession[],
  excludeSessionId?: string | null,
): WorkoutSession | null {
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  for (const session of sorted) {
    if (excludeSessionId && session.id === excludeSessionId) {
      continue;
    }
    if (session.exercises.length > 0) {
      return session;
    }
  }
  for (const session of sorted) {
    if (excludeSessionId && session.id === excludeSessionId) {
      continue;
    }
    return session;
  }
  return null;
}

export type SessionComparison = {
  previousSession: WorkoutSession | null;
  bodyWeightDelta: number | null;
  volumeDelta: number | null;
  volumeDeltaPercent: number | null;
};

export type CurrentSessionSnapshot = {
  bodyWeight: number;
  exercises: SessionExerciseEntry[];
};

export function compareWithPreviousSession(
  current: CurrentSessionSnapshot,
  sessions: WorkoutSession[],
  excludeSessionId?: string | null,
): SessionComparison {
  const previousSession = findPreviousSession(sessions, excludeSessionId);
  if (!previousSession) {
    return {
      previousSession: null,
      bodyWeightDelta: null,
      volumeDelta: null,
      volumeDeltaPercent: null,
    };
  }

  const currentVolume = sessionTotalVolume(current.exercises);
  const previousVolume = sessionTotalVolume(previousSession.exercises);
  const bodyWeightDelta = current.bodyWeight - previousSession.body_weight;
  const volumeDelta = currentVolume - previousVolume;
  const volumeDeltaPercent =
    previousVolume > 0 ? Math.round((volumeDelta / previousVolume) * 100) : currentVolume > 0 ? 100 : null;

  return {
    previousSession,
    bodyWeightDelta,
    volumeDelta,
    volumeDeltaPercent,
  };
}

export function exerciseMaxWeightDelta(currentSets: WorkoutSet[], priorSets: WorkoutSet[] | null): number | null {
  const currentMax = maxSetWeight(filterCompleteSets(currentSets));
  if (currentMax === null || !priorSets) {
    return null;
  }
  const priorMax = maxSetWeight(filterCompleteSets(priorSets));
  if (priorMax === null) {
    return null;
  }
  const delta = currentMax - priorMax;
  return delta > 0 ? delta : null;
}

export type HistoryPeriod = 7 | 30 | 90 | "all";

export type HistoryTab = "overview" | "sessions" | "progress" | "records";

function sessionDateMs(session: WorkoutSession): number {
  return new Date(session.date).getTime();
}

function periodCutoffMs(period: HistoryPeriod): number | null {
  if (period === "all") {
    return null;
  }
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - period);
  return cutoff.getTime();
}

export function filterSessionsByPeriod(sessions: WorkoutSession[], period: HistoryPeriod): WorkoutSession[] {
  const cutoff = periodCutoffMs(period);
  if (cutoff === null) {
    return [...sessions];
  }
  return sessions.filter((session) => sessionDateMs(session) >= cutoff);
}

export function filterProgressPointsByPeriod(points: ProgressPoint[], period: HistoryPeriod): ProgressPoint[] {
  const cutoff = periodCutoffMs(period);
  if (cutoff === null) {
    return [...points];
  }
  return points.filter((point) => new Date(point.date).getTime() >= cutoff);
}

export function countSessionsInPeriod(sessions: WorkoutSession[], period: HistoryPeriod): number {
  return filterSessionsByPeriod(sessions, period).length;
}

export function averageSessionVolume(sessions: WorkoutSession[], period: HistoryPeriod): number | null {
  const withExercises = filterSessionsByPeriod(sessions, period).filter((session) => session.exercises.length > 0);
  if (withExercises.length === 0) {
    return null;
  }
  const total = withExercises.reduce((sum, session) => sum + sessionTotalVolume(session.exercises), 0);
  return total / withExercises.length;
}

export function latestBodyWeight(sessions: WorkoutSession[]): { value: number; date: string } | null {
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  if (!latest) {
    return null;
  }
  return { value: latest.body_weight, date: latest.date };
}

export function bodyWeightDelta(sessions: WorkoutSession[]): number | null {
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length < 2) {
    return null;
  }
  return sorted[0].body_weight - sorted[1].body_weight;
}

export function lastUsedExerciseId(sessions: WorkoutSession[], catalog: ExerciseCatalogItem[]): string | null {
  const catalogIds = new Set(catalog.map((item) => item.id));
  const sorted = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  for (const session of sorted) {
    for (const exercise of session.exercises) {
      if (catalogIds.has(exercise.exercise_catalog_id)) {
        return exercise.exercise_catalog_id;
      }
    }
  }
  return catalog[0]?.id ?? null;
}

export function sessionMuscleGroups(session: WorkoutSession): MuscleGroup[] {
  const groups = new Set<MuscleGroup>();
  for (const exercise of session.exercises) {
    const group = exercise.muscle_group;
    if (group) {
      groups.add(group);
    }
  }
  return MUSCLE_GROUPS.filter((group) => groups.has(group));
}

export function sessionToExerciseEntries(session: WorkoutSession): SessionExerciseEntry[] {
  return session.exercises.map((exercise) => ({
    exercise_catalog_id: exercise.exercise_catalog_id,
    sets: exercise.sets,
    name: exercise.exercise_name ?? "Упражнение",
    muscle_group: exercise.muscle_group ?? "legs",
  }));
}

export function sessionPreviewLabel(session: WorkoutSession): string {
  if (session.exercises.length === 0) {
    return "Без упражнений";
  }
  const firstName = session.exercises[0]?.exercise_name ?? "Упражнение";
  const rest = session.exercises.length - 1;
  if (rest <= 0) {
    return firstName;
  }
  return `${firstName}, +${rest}`;
}

export function formatChartDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

export function bodyWeightStatsInPeriod(
  sessions: WorkoutSession[],
  period: HistoryPeriod,
): { min: number; max: number; delta: number | null } | null {
  const points = bodyWeightProgressPoints(filterSessionsByPeriod(sessions, period));
  if (points.length === 0) {
    return null;
  }
  const weights = points.map((point) => point.body_weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const delta = points.length >= 2 ? points[points.length - 1].body_weight - points[0].body_weight : null;
  return { min, max, delta };
}

export function prefillBodyWeightFromSessions(sessions: WorkoutSession[], current: string): string {
  if (current.trim()) {
    return current;
  }
  const latest = latestBodyWeight(sessions);
  if (!latest) {
    return current;
  }
  const formatted = Number.isInteger(latest.value) ? String(latest.value) : String(latest.value);
  return formatted;
}

export type WorkoutActivityDay = {
  key: string;
  volume: number;
  hasWorkout: boolean;
};

export type WorkoutStreak = {
  current: number;
  best: number;
};

export type MuscleVolumeShare = {
  group: MuscleGroup;
  volume: number;
  percent: number;
};

export type WeeklyVolumePoint = {
  weekStart: string;
  volume: number;
};

export type ReadinessTrendPoint = {
  date: string;
  mood: number;
  muscle_readiness: number;
  sleep_quality: number;
  general_fatigue: number;
};

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sessionDateKey(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate.slice(0, 10);
  }
  return formatDateKey(parsed);
}

function startOfWeekMonday(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function sessionsWithExercises(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.filter((session) => session.exercises.length > 0);
}

export function latestWorkoutSession(sessions: WorkoutSession[]): WorkoutSession | null {
  const sorted = [...sessionsWithExercises(sessions)].sort((a, b) => b.date.localeCompare(a.date));
  return sorted[0] ?? null;
}

export function workoutActivityHeatmap(sessions: WorkoutSession[], days = 90): WorkoutActivityDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const volumeByDate = new Map<string, number>();
  for (const session of sessionsWithExercises(sessions)) {
    const key = sessionDateKey(session.date);
    const volume = sessionTotalVolume(session.exercises);
    volumeByDate.set(key, (volumeByDate.get(key) ?? 0) + volume);
  }

  const result: WorkoutActivityDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const key = formatDateKey(date);
    const volume = volumeByDate.get(key) ?? 0;
    result.push({ key, volume, hasWorkout: volume > 0 });
  }
  return result;
}

export function workoutStreak(sessions: WorkoutSession[]): WorkoutStreak {
  const workoutDates = new Set(
    sessionsWithExercises(sessions).map((session) => sessionDateKey(session.date)),
  );
  if (workoutDates.size === 0) {
    return { current: 0, best: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = 0;
  const cursor = new Date(today);
  while (workoutDates.has(formatDateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const sortedDates = [...workoutDates].sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;

  for (const key of sortedDates) {
    const date = new Date(`${key}T00:00:00`);
    if (previous) {
      const diffDays = Math.round((date.getTime() - previous.getTime()) / 86_400_000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    previous = date;
  }

  return { current, best };
}

export function volumeByMuscleGroup(sessions: WorkoutSession[], period: HistoryPeriod = 30): MuscleVolumeShare[] {
  const filtered = filterSessionsByPeriod(sessionsWithExercises(sessions), period);
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((group) => [group, 0])) as Record<MuscleGroup, number>;

  for (const session of filtered) {
    for (const exercise of session.exercises) {
      const group = exercise.muscle_group ?? "legs";
      totals[group] += exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
    }
  }

  const grandTotal = MUSCLE_GROUPS.reduce((sum, group) => sum + totals[group], 0);
  if (grandTotal === 0) {
    return [];
  }

  return MUSCLE_GROUPS.filter((group) => totals[group] > 0)
    .map((group) => ({
      group,
      volume: totals[group],
      percent: Math.round((totals[group] / grandTotal) * 100),
    }))
    .sort((a, b) => b.volume - a.volume);
}

export function weeklyVolumePoints(sessions: WorkoutSession[], weeks = 8): WeeklyVolumePoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = startOfWeekMonday(today);

  const volumeByWeek = new Map<string, number>();
  for (const session of sessionsWithExercises(sessions)) {
    const weekStart = formatDateKey(startOfWeekMonday(new Date(session.date)));
    const volume = sessionTotalVolume(session.exercises);
    volumeByWeek.set(weekStart, (volumeByWeek.get(weekStart) ?? 0) + volume);
  }

  const points: WeeklyVolumePoint[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const weekStartDate = new Date(currentWeekStart);
    weekStartDate.setDate(weekStartDate.getDate() - index * 7);
    const weekStart = formatDateKey(weekStartDate);
    points.push({ weekStart, volume: volumeByWeek.get(weekStart) ?? 0 });
  }
  return points;
}

export function readinessTrendPoints(sessions: WorkoutSession[], period: HistoryPeriod = 30): ReadinessTrendPoint[] {
  const filtered = filterSessionsByPeriod(sessionsWithExercises(sessions), period);
  return [...filtered]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => ({
      date: session.date.slice(0, 10),
      mood: session.mood,
      muscle_readiness: session.muscle_readiness,
      sleep_quality: session.sleep_quality,
      general_fatigue: session.general_fatigue,
    }));
}
