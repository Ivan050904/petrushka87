"use client";

import { SegmentTabs } from "@/components/ui/segment-tabs";
import { WorkoutHistoryCharts } from "@/features/workouts/workout-history-charts";
import { WorkoutHistoryOverview } from "@/features/workouts/workout-history-overview";
import { WorkoutHistoryRecords } from "@/features/workouts/workout-history-records";
import { WorkoutHistorySessions } from "@/features/workouts/workout-history-sessions";
import {
  type ExerciseCatalogItem,
  type HistoryTab,
  type MuscleGroup,
  type PersonalRecord,
  type ProgressPoint,
  type WorkoutSession,
} from "@/lib/workouts";

const HISTORY_TAB_OPTIONS: Array<{ value: HistoryTab; label: string }> = [
  { value: "overview", label: "Обзор" },
  { value: "sessions", label: "Тренировки" },
  { value: "progress", label: "Прогресс" },
  { value: "records", label: "Рекорды" },
];

type WorkoutHistoryViewProps = {
  historyTab: HistoryTab;
  catalog: ExerciseCatalogItem[];
  sessions: WorkoutSession[];
  records: PersonalRecord[];
  exerciseChart: ProgressPoint[];
  groupChart: ProgressPoint[];
  chartExerciseId: string;
  chartGroup: MuscleGroup;
  recordForm: { exerciseId: string; weight: string; reps: string; date: string };
  isSaving: boolean;
  onHistoryTabChange: (tab: HistoryTab) => void;
  onChartExerciseChange: (id: string) => void;
  onChartGroupChange: (group: MuscleGroup) => void;
  onRecordFormChange: (patch: Partial<{ exerciseId: string; weight: string; reps: string; date: string }>) => void;
  onSaveRecord: () => void;
  onRemoveSession: (sessionId: string) => void;
  onSelectExerciseForChart: (exerciseId: string) => void;
  onStartWorkout: () => void;
};

export function WorkoutHistoryView({
  historyTab,
  catalog,
  sessions,
  records,
  exerciseChart,
  groupChart,
  chartExerciseId,
  chartGroup,
  recordForm,
  isSaving,
  onHistoryTabChange,
  onChartExerciseChange,
  onChartGroupChange,
  onRecordFormChange,
  onSaveRecord,
  onRemoveSession,
  onSelectExerciseForChart,
  onStartWorkout,
}: WorkoutHistoryViewProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
      <SegmentTabs
        value={historyTab}
        options={HISTORY_TAB_OPTIONS}
        onChange={onHistoryTabChange}
        size="compact"
        className="grid-cols-2 sm:grid-cols-4"
        ariaLabel="Разделы истории"
      />

      {historyTab === "overview" ? (
        <WorkoutHistoryOverview
          sessions={sessions}
          records={records}
          catalog={catalog}
          exerciseChart={exerciseChart}
          chartExerciseId={chartExerciseId}
          onShowAllSessions={() => onHistoryTabChange("sessions")}
          onShowProgress={() => onHistoryTabChange("progress")}
          onStartWorkout={onStartWorkout}
        />
      ) : null}

      {historyTab === "sessions" ? (
        <WorkoutHistorySessions
          sessions={sessions}
          onRemoveSession={onRemoveSession}
          onSelectExerciseForChart={onSelectExerciseForChart}
        />
      ) : null}

      {historyTab === "progress" ? (
        <WorkoutHistoryCharts
          sessions={sessions}
          catalog={catalog}
          exerciseChart={exerciseChart}
          groupChart={groupChart}
          chartExerciseId={chartExerciseId}
          chartGroup={chartGroup}
          onChartExerciseChange={onChartExerciseChange}
          onChartGroupChange={onChartGroupChange}
        />
      ) : null}

      {historyTab === "records" ? (
        <WorkoutHistoryRecords
          catalog={catalog}
          records={records}
          recordForm={recordForm}
          isSaving={isSaving}
          onRecordFormChange={onRecordFormChange}
          onSaveRecord={onSaveRecord}
        />
      ) : null}
    </div>
  );
}
