"use client";

import { Dumbbell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkoutSummaryComparison } from "@/features/workouts/workout-summary-comparison";
import { formatDate } from "@/lib/entry-helpers";
import {
  compareWithPreviousSession,
  formatMuscleGroup,
  formatSetsSummary,
  formatVolume,
  groupSessionExercisesByMuscle,
  sessionMuscleGroups,
  sessionToExerciseEntries,
  sessionTotalVolume,
  type WorkoutSession,
} from "@/lib/workouts";

type WorkoutLastSessionHeroProps = {
  session: WorkoutSession | null;
  earlierSessions: WorkoutSession[];
  sessions: WorkoutSession[];
  onShowAllSessions: () => void;
  onStartWorkout: () => void;
};

export function WorkoutLastSessionHero({
  session,
  earlierSessions,
  sessions,
  onShowAllSessions,
  onStartWorkout,
}: WorkoutLastSessionHeroProps) {
  if (!session) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <Dumbbell className="size-10 text-muted-foreground/50" aria-hidden="true" />
          <div>
            <p className="font-medium">Тренировок пока нет</p>
            <p className="mt-1 text-sm text-muted-foreground">Запиши первую — здесь появится разбор подходов и объёма.</p>
          </div>
          <Button type="button" onClick={onStartWorkout}>
            Начать тренировку
          </Button>
        </CardContent>
      </Card>
    );
  }

  const exerciseEntries = sessionToExerciseEntries(session);
  const grouped = groupSessionExercisesByMuscle(exerciseEntries);
  const groups = sessionMuscleGroups(session);
  const volume = sessionTotalVolume(session.exercises);
  const comparison = compareWithPreviousSession(
    { bodyWeight: session.body_weight, exercises: exerciseEntries },
    sessions,
    session.id,
  );

  return (
    <Card className="h-full">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Последняя тренировка</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(session.date)} · {session.body_weight} кг · {formatVolume(volume)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onShowAllSessions}>
          Все тренировки →
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {groups.map((group) => (
            <Badge key={group} variant="secondary">
              {formatMuscleGroup(group)}
            </Badge>
          ))}
        </div>

        <WorkoutSummaryComparison comparison={comparison} />

        <div className="space-y-3">
          {grouped.map((block) => (
            <div key={block.group}>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {formatMuscleGroup(block.group)}
              </div>
              <div className="space-y-1.5">
                {block.items.map((item) => (
                  <div
                    key={item.exercise_catalog_id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground tabular-nums">{formatSetsSummary(item.sets)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {earlierSessions.length > 0 ? (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ранее</p>
            <div className="space-y-1.5">
              {earlierSessions.map((earlier) => (
                <div key={earlier.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatDate(earlier.date)}</span>
                  <span className="tabular-nums">{formatVolume(sessionTotalVolume(earlier.exercises))}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
