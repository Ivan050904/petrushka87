"use client";

import { LineChart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LowDataProgressNotice, ProgressWeightChart } from "@/features/workouts/workout-chart";
import { formatMuscleGroup, type ExerciseCatalogItem, type ProgressPoint } from "@/lib/workouts";

type WorkoutProgressPreviewProps = {
  catalog: ExerciseCatalogItem[];
  exerciseChart: ProgressPoint[];
  chartExerciseId: string;
  onShowProgress: () => void;
  onStartWorkout: () => void;
};

export function WorkoutProgressPreview({
  catalog,
  exerciseChart,
  chartExerciseId,
  onShowProgress,
  onStartWorkout,
}: WorkoutProgressPreviewProps) {
  const exercise = catalog.find((item) => item.id === chartExerciseId) ?? null;
  const lastPoint = exerciseChart[exerciseChart.length - 1] ?? null;

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChart className="size-4" />
          Прогресс
        </CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={onShowProgress}>
          Подробнее →
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {exercise ? (
          <p className="text-sm text-muted-foreground">
            {exercise.name} · {formatMuscleGroup(exercise.muscle_group)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Выбери упражнение в разделе «Прогресс».</p>
        )}
        {exerciseChart.length < 3 ? (
          <div className="space-y-3">
            <LowDataProgressNotice
              pointCount={exerciseChart.length}
              lastWeight={lastPoint?.max_weight ?? null}
              lastDate={lastPoint?.date ?? null}
            />
            <Button type="button" size="sm" onClick={onStartWorkout}>
              Начать тренировку
            </Button>
          </div>
        ) : (
          <ProgressWeightChart data={exerciseChart} emptyLabel="Нет данных" heightClassName="h-48" />
        )}
      </CardContent>
    </Card>
  );
}
