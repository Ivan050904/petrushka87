"use client";

import { Badge } from "@/components/ui/badge";
import {
  exerciseMaxWeightDelta,
  formatMuscleGroup,
  groupSessionExercisesByMuscle,
  isNewPersonalRecord,
  lastSetsForExercise,
  maxSetWeight,
  type PersonalRecord,
  type SessionExerciseEntry,
  type WorkoutSession,
} from "@/lib/workouts";

type WorkoutSummaryExercisesProps = {
  sessionExercises: SessionExerciseEntry[];
  sessions: WorkoutSession[];
  sessionId: string | null;
  records: PersonalRecord[];
};

export function WorkoutSummaryExercises({
  sessionExercises,
  sessions,
  sessionId,
  records,
}: WorkoutSummaryExercisesProps) {
  if (sessionExercises.length === 0) {
    return <p className="text-sm text-muted-foreground">Упражнения не были сохранены в этой тренировке.</p>;
  }

  const grouped = groupSessionExercisesByMuscle(sessionExercises);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Упражнения ({sessionExercises.length})</p>
      {grouped.map(({ group, items }) => (
        <div key={group} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{formatMuscleGroup(group)}</h3>
            <Badge variant="secondary">{items.length}</Badge>
          </div>
          <div className="space-y-2">
            {items.map((item) => {
              const maxWeight = maxSetWeight(item.sets);
              const isPr = isNewPersonalRecord(item.sets, records, item.exercise_catalog_id);
              const priorSets = lastSetsForExercise(sessions, item.exercise_catalog_id, sessionId);
              const weightDelta = exerciseMaxWeightDelta(item.sets, priorSets);

              return (
                <div key={item.exercise_catalog_id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      {isPr ? (
                        <Badge variant="outline" className="border-accent text-accent">
                          Новый PR
                        </Badge>
                      ) : null}
                    </div>
                    {maxWeight !== null ? (
                      <span className="text-sm tabular-nums text-muted-foreground">max {maxWeight} кг</span>
                    ) : null}
                  </div>
                  {weightDelta !== null ? (
                    <p className="mt-0.5 text-xs text-accent">+{weightDelta} кг к прошлому разу</p>
                  ) : null}
                  <div className="mt-2 space-y-1">
                    {item.sets.map((set, index) => (
                      <div
                        key={`${item.exercise_catalog_id}-${index}`}
                        className="flex items-center gap-3 text-sm tabular-nums text-muted-foreground"
                      >
                        <span className="w-6 text-xs">#{index + 1}</span>
                        <span>
                          {set.weight} × {set.reps}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
