import { describe, expect, it } from "vitest";

import { buildSetRows, bodyWeightProgressPoints, filterCompleteSets, formatMuscleGroup, maxSetWeight } from "@/lib/workouts";
import type { WorkoutSession } from "@/lib/workouts";

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
});
