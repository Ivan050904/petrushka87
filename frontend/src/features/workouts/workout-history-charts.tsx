"use client";

import { useState } from "react";
import { LineChart, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SegmentTabs } from "@/components/ui/segment-tabs";
import { BodyWeightChart, LowDataProgressNotice, ProgressWeightChart } from "@/features/workouts/workout-chart";
import {
  bodyWeightProgressPoints,
  bodyWeightStatsInPeriod,
  filterProgressPointsByPeriod,
  filterSessionsByPeriod,
  formatMuscleGroup,
  MUSCLE_GROUPS,
  type ExerciseCatalogItem,
  type HistoryPeriod,
  type MuscleGroup,
  type ProgressPoint,
  type WorkoutSession,
} from "@/lib/workouts";

const PERIOD_OPTIONS: Array<{ value: HistoryPeriod; label: string }> = [
  { value: 7, label: "7д" },
  { value: 30, label: "30д" },
  { value: 90, label: "3м" },
  { value: "all", label: "Всё" },
];

type ProgressMode = "exercise" | "group";

type WorkoutHistoryChartsProps = {
  sessions: WorkoutSession[];
  catalog: ExerciseCatalogItem[];
  exerciseChart: ProgressPoint[];
  groupChart: ProgressPoint[];
  chartExerciseId: string;
  chartGroup: MuscleGroup;
  onChartExerciseChange: (id: string) => void;
  onChartGroupChange: (group: MuscleGroup) => void;
};

export function WorkoutHistoryCharts({
  sessions,
  catalog,
  exerciseChart,
  groupChart,
  chartExerciseId,
  chartGroup,
  onChartExerciseChange,
  onChartGroupChange,
}: WorkoutHistoryChartsProps) {
  const [period, setPeriod] = useState<HistoryPeriod>(90);
  const [progressMode, setProgressMode] = useState<ProgressMode>("exercise");

  const bodyChart = bodyWeightProgressPoints(filterSessionsByPeriod(sessions, period));
  const bodyStats = bodyWeightStatsInPeriod(sessions, period);
  const filteredExerciseChart = filterProgressPointsByPeriod(exerciseChart, period);
  const filteredGroupChart = filterProgressPointsByPeriod(groupChart, period);
  const activeChart = progressMode === "exercise" ? filteredExerciseChart : filteredGroupChart;
  const lastPoint = activeChart[activeChart.length - 1] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={String(option.value)}
            type="button"
            size="sm"
            variant={period === option.value ? "default" : "outline"}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="size-4" />
            Вес тела
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bodyStats ? (
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>
                min <span className="font-medium text-foreground">{bodyStats.min} кг</span>
              </span>
              <span>
                max <span className="font-medium text-foreground">{bodyStats.max} кг</span>
              </span>
            </div>
          ) : null}
          <BodyWeightChart data={bodyChart} heightClassName="h-56" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="size-4" />
            Прогресс
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SegmentTabs
            value={progressMode}
            options={[
              { value: "exercise", label: "Упражнение" },
              { value: "group", label: "Группа" },
            ]}
            onChange={setProgressMode}
            size="compact"
            className="grid-cols-2"
            ariaLabel="Режим прогресса"
          />

          {progressMode === "exercise" ? (
            <Select value={chartExerciseId} onChange={(event) => onChartExerciseChange(event.target.value)}>
              <option value="">Выбери упражнение</option>
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({formatMuscleGroup(item.muscle_group)})
                </option>
              ))}
            </Select>
          ) : (
            <Select value={chartGroup} onChange={(event) => onChartGroupChange(event.target.value as MuscleGroup)}>
              {MUSCLE_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {formatMuscleGroup(group)}
                </option>
              ))}
            </Select>
          )}

          {activeChart.length < 3 ? (
            <LowDataProgressNotice
              pointCount={activeChart.length}
              lastWeight={lastPoint?.max_weight ?? null}
              lastDate={lastPoint?.date ?? null}
            />
          ) : (
            <ProgressWeightChart
              data={activeChart}
              emptyLabel={progressMode === "exercise" ? "Нет данных по упражнению" : "Нет данных по группе"}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
