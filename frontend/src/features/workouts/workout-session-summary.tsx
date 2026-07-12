"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkoutSummaryComparison } from "@/features/workouts/workout-summary-comparison";
import { WorkoutSummaryExercises } from "@/features/workouts/workout-summary-exercises";
import { WorkoutSummaryKpi } from "@/features/workouts/workout-summary-kpi";
import {
  compareWithPreviousSession,
  sessionTotalVolume,
  type PersonalRecord,
  type SessionExerciseEntry,
  type WorkoutSession,
  type WorkoutStartForm,
} from "@/lib/workouts";

type WorkoutSessionSummaryProps = {
  startForm: WorkoutStartForm;
  sessionExercises: SessionExerciseEntry[];
  sessionId: string | null;
  sessions: WorkoutSession[];
  records: PersonalRecord[];
  sessionDate?: string;
  onGoToHistory: () => void;
  onNewWorkout: () => void;
};

export function WorkoutSessionSummary({
  startForm,
  sessionExercises,
  sessionId,
  sessions,
  records,
  sessionDate,
  onGoToHistory,
  onNewWorkout,
}: WorkoutSessionSummaryProps) {
  const resolvedDate = sessionDate ?? new Date().toISOString();
  const volume = sessionTotalVolume(sessionExercises);
  const bodyWeight = parseFloat(startForm.bodyWeight.replace(",", ".")) || 0;

  const comparison = useMemo(
    () =>
      compareWithPreviousSession(
        { bodyWeight, exercises: sessionExercises },
        sessions,
        sessionId,
      ),
    [bodyWeight, sessionExercises, sessions, sessionId],
  );

  return (
    <Card className="w-full">
      <CardContent className="space-y-5 pt-6">
        <WorkoutSummaryKpi
          sessionDate={resolvedDate}
          startForm={startForm}
          exerciseCount={sessionExercises.length}
          volume={volume}
        />
        <WorkoutSummaryComparison comparison={comparison} />
        <WorkoutSummaryExercises
          sessionExercises={sessionExercises}
          sessions={sessions}
          sessionId={sessionId}
          records={records}
        />
      </CardContent>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 pb-4 pt-4">
        <Button onClick={onGoToHistory}>К истории</Button>
        <Button variant="outline" onClick={onNewWorkout}>
          Новая тренировка
        </Button>
      </div>
    </Card>
  );
}
