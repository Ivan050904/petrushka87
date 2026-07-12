import { describe, expect, it } from "vitest";

import {
  averageSessionVolume,
  bodyWeightDelta,
  buildSetRows,
  bodyWeightProgressPoints,
  compareWithPreviousSession,
  countSessionsInPeriod,
  exerciseMaxWeightDelta,
  filterCompleteSets,
  filterSessionsByPeriod,
  findPreviousSession,
  formatChartDate,
  formatMuscleGroup,
  formatSetsSummary,
  formatVolume,
  groupCatalogByMuscle,
  groupSessionExercisesByMuscle,
  isNewPersonalRecord,
  lastSetsForExercise,
  lastUsedExerciseId,
  latestWorkoutSession,
  maxSetWeight,
  prefillBodyWeightFromSessions,
  readinessTrendPoints,
  sessionPreviewLabel,
  sessionTotalVolume,
  volumeByMuscleGroup,
  weeklyVolumePoints,
  workoutActivityHeatmap,
  workoutStreak,
} from "@/lib/workouts";
import type { ExerciseCatalogItem, SessionExerciseEntry, WorkoutSession } from "@/lib/workouts";

describe("workouts helpers", () => {
  it("formats muscle group labels", () => {
    expect(formatMuscleGroup("legs")).toBe("Ноги");
    expect(formatMuscleGroup("triceps")).toBe("Трицепс");
  });

  it("returns max set weight", () => {
    expect(maxSetWeight([])).toBeNull();
    expect(maxSetWeight([{ weight: 80, reps: 10 }, { weight: 100, reps: 5 }])).toBe(100);
  });

  it("filters complete sets", () => {
    expect(
      filterCompleteSets([
        { weight: 0, reps: 0 },
        { weight: 50, reps: 10 },
        { weight: 60, reps: 0 },
      ]),
    ).toEqual([{ weight: 50, reps: 10 }]);
  });

  it("builds fixed number of set rows", () => {
    expect(buildSetRows(3)).toEqual([
      { weight: 0, reps: 0 },
      { weight: 0, reps: 0 },
      { weight: 0, reps: 0 },
    ]);
    expect(buildSetRows(2, [{ weight: 80, reps: 10 }, { weight: 90, reps: 8 }])).toEqual([
      { weight: 80, reps: 10 },
      { weight: 90, reps: 8 },
    ]);
  });

  it("builds body weight chart points from sessions", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: "2026-01-10T10:00:00Z",
        body_weight: 79.5,
        mood: 7,
        muscle_readiness: 7,
        sleep_quality: 7,
        general_fatigue: 4,
        created_at: "2026-01-10T10:00:00Z",
        updated_at: "2026-01-10T10:00:00Z",
        exercises: [],
      },
      {
        id: "2",
        date: "2026-01-15T10:00:00Z",
        body_weight: 78.8,
        mood: 8,
        muscle_readiness: 8,
        sleep_quality: 8,
        general_fatigue: 3,
        created_at: "2026-01-15T10:00:00Z",
        updated_at: "2026-01-15T10:00:00Z",
        exercises: [],
      },
    ];
    expect(bodyWeightProgressPoints(sessions)).toEqual([
      { date: "2026-01-10", body_weight: 79.5 },
      { date: "2026-01-15", body_weight: 78.8 },
    ]);
  });

  it("groups catalog by muscle", () => {
    const catalog: ExerciseCatalogItem[] = [
      { id: "1", name: "Присед", muscle_group: "legs", created_at: "2026-01-01" },
      { id: "2", name: "Жим", muscle_group: "back", created_at: "2026-01-01" },
      { id: "3", name: "Разгибание", muscle_group: "legs", created_at: "2026-01-01" },
    ];
    const grouped = groupCatalogByMuscle(catalog);
    expect(grouped.legs.map((item) => item.name)).toEqual(["Присед", "Разгибание"]);
    expect(grouped.back.map((item) => item.name)).toEqual(["Жим"]);
    expect(grouped.biceps).toEqual([]);
  });

  it("finds last sets for exercise from past sessions", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "old",
        date: "2026-01-01T10:00:00Z",
        body_weight: 80,
        mood: 7,
        muscle_readiness: 7,
        sleep_quality: 7,
        general_fatigue: 4,
        created_at: "2026-01-01T10:00:00Z",
        updated_at: "2026-01-01T10:00:00Z",
        exercises: [
          {
            id: "e1",
            exercise_catalog_id: "squat",
            sets: [{ weight: 100, reps: 5 }],
          },
        ],
      },
      {
        id: "new",
        date: "2026-01-10T10:00:00Z",
        body_weight: 80,
        mood: 7,
        muscle_readiness: 7,
        sleep_quality: 7,
        general_fatigue: 4,
        created_at: "2026-01-10T10:00:00Z",
        updated_at: "2026-01-10T10:00:00Z",
        exercises: [
          {
            id: "e2",
            exercise_catalog_id: "squat",
            sets: [{ weight: 110, reps: 3 }],
          },
        ],
      },
    ];
    expect(lastSetsForExercise(sessions, "squat")).toEqual([{ weight: 110, reps: 3 }]);
    expect(lastSetsForExercise(sessions, "squat", "new")).toEqual([{ weight: 100, reps: 5 }]);
    expect(lastSetsForExercise(sessions, "missing")).toBeNull();
  });

  it("calculates session total volume", () => {
    expect(
      sessionTotalVolume([
        { sets: [{ weight: 100, reps: 5 }, { weight: 110, reps: 3 }] },
        { sets: [{ weight: 50, reps: 10 }] },
      ]),
    ).toBe(100 * 5 + 110 * 3 + 50 * 10);
  });

  it("formats sets summary", () => {
    expect(formatSetsSummary([{ weight: 100, reps: 5 }, { weight: 110, reps: 3 }])).toBe("100×5 · 110×3");
  });

  it("detects new personal record", () => {
    expect(isNewPersonalRecord([{ weight: 105, reps: 5 }], [], "squat")).toBe(true);
    expect(
      isNewPersonalRecord(
        [{ weight: 105, reps: 5 }],
        [{ id: "1", exercise_catalog_id: "squat", weight: 100, reps: 5, date: "2026-01-01", created_at: "" }],
        "squat",
      ),
    ).toBe(true);
    expect(
      isNewPersonalRecord(
        [{ weight: 95, reps: 5 }],
        [{ id: "1", exercise_catalog_id: "squat", weight: 100, reps: 5, date: "2026-01-01", created_at: "" }],
        "squat",
      ),
    ).toBe(false);
  });

  it("groups session exercises by muscle in catalog order", () => {
    const exercises: SessionExerciseEntry[] = [
      {
        exercise_catalog_id: "1",
        name: "Жим",
        muscle_group: "chest",
        sets: [{ weight: 80, reps: 10 }],
      },
      {
        exercise_catalog_id: "2",
        name: "Присед",
        muscle_group: "legs",
        sets: [{ weight: 100, reps: 5 }],
      },
    ];
    const grouped = groupSessionExercisesByMuscle(exercises);
    expect(grouped.map((block) => block.group)).toEqual(["legs", "chest"]);
    expect(grouped[0]?.items[0]?.name).toBe("Присед");
  });

  it("formats volume", () => {
    expect(formatVolume(5180)).toMatch(/5[\s\u00a0\u202f]?180/);
    expect(formatVolume(5180)).toContain("кг·повт");
  });

  it("finds previous session excluding current", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "current",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "a", sets: [{ weight: 100, reps: 5 }] }],
      },
      {
        id: "prev",
        date: "2026-07-05T10:00:00Z",
        body_weight: 76.5,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e2", exercise_catalog_id: "a", sets: [{ weight: 90, reps: 5 }] }],
      },
    ];
    expect(findPreviousSession(sessions, "current")?.id).toBe("prev");
  });

  it("compares with previous session", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "current",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
      {
        id: "prev",
        date: "2026-07-05T10:00:00Z",
        body_weight: 76.5,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e2", exercise_catalog_id: "a", sets: [{ weight: 100, reps: 10 }] }],
      },
    ];
    const comparison = compareWithPreviousSession(
      {
        bodyWeight: 76,
        exercises: [{ exercise_catalog_id: "a", name: "A", muscle_group: "legs", sets: [{ weight: 110, reps: 10 }] }],
      },
      sessions,
      "current",
    );
    expect(comparison.bodyWeightDelta).toBeCloseTo(-0.5);
    expect(comparison.volumeDelta).toBe(100);
    expect(comparison.volumeDeltaPercent).toBe(10);
  });

  it("calculates exercise max weight delta", () => {
    expect(exerciseMaxWeightDelta([{ weight: 110, reps: 5 }], [{ weight: 100, reps: 5 }])).toBe(10);
    expect(exerciseMaxWeightDelta([{ weight: 90, reps: 5 }], [{ weight: 100, reps: 5 }])).toBeNull();
  });

  it("filters sessions by period", () => {
    const now = new Date();
    const recent = new Date(now);
    recent.setDate(recent.getDate() - 2);
    const old = new Date(now);
    old.setDate(old.getDate() - 20);
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: recent.toISOString(),
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
      {
        id: "2",
        date: old.toISOString(),
        body_weight: 75,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
    ];
    expect(filterSessionsByPeriod(sessions, 7)).toHaveLength(1);
    expect(filterSessionsByPeriod(sessions, "all")).toHaveLength(2);
  });

  it("builds session preview label", () => {
    expect(
      sessionPreviewLabel({
        id: "1",
        date: "",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [
          { id: "e1", exercise_catalog_id: "a", exercise_name: "Присед", sets: [] },
          { id: "e2", exercise_catalog_id: "b", exercise_name: "Жим", sets: [] },
        ],
      }),
    ).toBe("Присед, +1");
  });

  it("finds last used exercise id", () => {
    const catalog: ExerciseCatalogItem[] = [
      { id: "a", name: "A", muscle_group: "legs", created_at: "" },
      { id: "b", name: "B", muscle_group: "back", created_at: "" },
    ];
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "b", sets: [{ weight: 100, reps: 5 }] }],
      },
    ];
    expect(lastUsedExerciseId(sessions, catalog)).toBe("b");
  });

  it("computes average session volume skipping empty sessions", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "a", sets: [{ weight: 100, reps: 10 }] }],
      },
      {
        id: "2",
        date: "2026-07-11T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
    ];
    expect(averageSessionVolume(sessions, "all")).toBe(1000);
  });

  it("formats chart date in ru locale", () => {
    expect(formatChartDate("2026-07-12T10:00:00Z")).toMatch(/12/);
  });

  it("calculates body weight delta between last two sessions", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
      {
        id: "2",
        date: "2026-07-05T10:00:00Z",
        body_weight: 76.5,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
    ];
    expect(bodyWeightDelta(sessions)).toBeCloseTo(-0.5);
    expect(countSessionsInPeriod(sessions, "all")).toBe(2);
  });

  it("prefills body weight from latest session when empty", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
    ];
    expect(prefillBodyWeightFromSessions(sessions, "")).toBe("76");
    expect(prefillBodyWeightFromSessions(sessions, "80")).toBe("80");
  });

  it("builds workout activity heatmap with volume aggregation", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "a", sets: [{ weight: 100, reps: 10 }] }],
      },
    ];
    const heatmap = workoutActivityHeatmap(sessions, 7);
    expect(heatmap).toHaveLength(7);
    const today = heatmap[heatmap.length - 1];
    expect(today.hasWorkout).toBe(true);
    expect(today.volume).toBe(1000);
  });

  it("computes workout streak across consecutive days", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: new Date().toISOString(),
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "a", sets: [{ weight: 50, reps: 10 }] }],
      },
      {
        id: "2",
        date: new Date(Date.now() - 86_400_000).toISOString(),
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e2", exercise_catalog_id: "a", sets: [{ weight: 50, reps: 10 }] }],
      },
    ];
    const streak = workoutStreak(sessions);
    expect(streak.current).toBeGreaterThanOrEqual(2);
    expect(streak.best).toBeGreaterThanOrEqual(2);
  });

  it("computes muscle group volume shares", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [
          {
            id: "e1",
            exercise_catalog_id: "a",
            muscle_group: "legs",
            sets: [{ weight: 100, reps: 10 }],
          },
          {
            id: "e2",
            exercise_catalog_id: "b",
            muscle_group: "back",
            sets: [{ weight: 50, reps: 10 }],
          },
        ],
      },
    ];
    const shares = volumeByMuscleGroup(sessions, "all");
    expect(shares.reduce((sum, item) => sum + item.percent, 0)).toBe(100);
    expect(shares[0]?.group).toBe("legs");
  });

  it("groups weekly volume points", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "1",
        date: new Date().toISOString(),
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "a", sets: [{ weight: 100, reps: 10 }] }],
      },
    ];
    const points = weeklyVolumePoints(sessions, 4);
    expect(points).toHaveLength(4);
    expect(points.some((point) => point.volume > 0)).toBe(true);
  });

  it("returns readiness trend points sorted by date", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "2",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 7,
        muscle_readiness: 6,
        sleep_quality: 8,
        general_fatigue: 3,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "a", sets: [{ weight: 50, reps: 10 }] }],
      },
      {
        id: "1",
        date: "2026-07-10T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e2", exercise_catalog_id: "a", sets: [{ weight: 50, reps: 10 }] }],
      },
    ];
    const points = readinessTrendPoints(sessions, "all");
    expect(points).toHaveLength(2);
    expect(points[0]?.date).toBe("2026-07-10");
    expect(points[1]?.mood).toBe(7);
  });

  it("returns latest workout session with exercises", () => {
    const sessions: WorkoutSession[] = [
      {
        id: "empty",
        date: "2026-07-13T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [],
      },
      {
        id: "workout",
        date: "2026-07-12T10:00:00Z",
        body_weight: 76,
        mood: 5,
        muscle_readiness: 5,
        sleep_quality: 5,
        general_fatigue: 5,
        created_at: "",
        updated_at: "",
        exercises: [{ id: "e1", exercise_catalog_id: "a", sets: [{ weight: 50, reps: 10 }] }],
      },
    ];
    expect(latestWorkoutSession(sessions)?.id).toBe("workout");
  });
});
