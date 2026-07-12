"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Dumbbell, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { TRACKING_SCROLL_COL, TRACKING_SHELL } from "@/features/tracking/tracking-layout";
import { WorkoutHistoryView } from "@/features/workouts/workout-history-view";
import { WorkoutMuscleGroupAccordion } from "@/features/workouts/workout-muscle-group-accordion";
import { WorkoutSessionBar } from "@/features/workouts/workout-session-bar";
import { WorkoutSessionSummary } from "@/features/workouts/workout-session-summary";
import { WorkoutSetsEditor } from "@/features/workouts/workout-sets-editor";
import { WorkoutStartCard } from "@/features/workouts/workout-start-card";
import {
  parseDecimal,
  rowsWithKeys,
  type SetRow,
  type WizardStep,
} from "@/features/workouts/workout-utils";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  createWorkoutCatalogItem,
  createWorkoutRecord,
  createWorkoutSession,
  deleteWorkoutSession,
  getErrorMessage,
  getWorkoutExerciseAnalytics,
  getWorkoutMuscleGroupAnalytics,
  listWorkoutCatalog,
  listWorkoutRecords,
  listWorkoutSessions,
  updateWorkoutSession,
} from "@/lib/api";
import {
  buildSetRows,
  countSessionExercisesDone,
  defaultWorkoutStartForm,
  DEFAULT_SET_COUNT,
  filterCompleteSets,
  groupCatalogByMuscle,
  lastSetsForExercise,
  lastUsedExerciseId,
  prefillBodyWeightFromSessions,
  type ExerciseCatalogItem,
  type HistoryTab,
  type MuscleGroup,
  type PersonalRecord,
  type ProgressPoint,
  type SessionExerciseEntry,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutStartForm,
} from "@/lib/workouts";
import { cn } from "@/lib/utils";

export function WorkoutsPanel() {
  const { token } = useRequireAuth();
  const [step, setStep] = useState<WizardStep>("start");
  const [view, setView] = useState<"wizard" | "history">("wizard");
  const [historyTab, setHistoryTab] = useState<HistoryTab>("overview");
  const [startForm, setStartForm] = useState<WorkoutStartForm>(defaultWorkoutStartForm());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<MuscleGroup>>(() => new Set(["legs"]));
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [setCount, setSetCount] = useState(DEFAULT_SET_COUNT);
  const [newExerciseNames, setNewExerciseNames] = useState<Partial<Record<MuscleGroup, string>>>({});
  const [setRows, setSetRows] = useState<SetRow[]>(() => rowsWithKeys(buildSetRows(DEFAULT_SET_COUNT)));
  const [sessionExercises, setSessionExercises] = useState<SessionExerciseEntry[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [exerciseChart, setExerciseChart] = useState<ProgressPoint[]>([]);
  const [groupChart, setGroupChart] = useState<ProgressPoint[]>([]);
  const [chartExerciseId, setChartExerciseId] = useState<string>("");
  const [chartGroup, setChartGroup] = useState<MuscleGroup>("legs");
  const [recordForm, setRecordForm] = useState({
    exerciseId: "",
    weight: "",
    reps: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const catalogByGroup = useMemo(() => groupCatalogByMuscle(catalog), [catalog]);
  const sessionProgress = useMemo(() => countSessionExercisesDone(sessionExercises, catalog), [sessionExercises, catalog]);
  const selectedExercise = useMemo(
    () => catalog.find((item) => item.id === selectedExerciseId) ?? null,
    [catalog, selectedExerciseId],
  );
  const savedExerciseIds = useMemo(
    () => new Set(sessionExercises.map((item) => item.exercise_catalog_id)),
    [sessionExercises],
  );

  const loadCatalog = useCallback(async () => {
    if (!token) {
      return;
    }
    const items = await listWorkoutCatalog(token);
    setCatalog(items);
  }, [token]);

  const loadSessions = useCallback(async () => {
    if (!token) {
      return;
    }
    const result = await listWorkoutSessions(token, { limit: 50 });
    setSessions(result.items);
  }, [token]);

  const loadRecords = useCallback(async () => {
    if (!token) {
      return;
    }
    const items = await listWorkoutRecords(token);
    setRecords(items);
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    Promise.all([loadCatalog(), loadSessions(), loadRecords()])
      .catch((requestError) => setError(getErrorMessage(requestError, "Не удалось загрузить данные зала.")))
      .finally(() => setIsLoading(false));
  }, [token, loadCatalog, loadSessions, loadRecords]);

  useEffect(() => {
    if (!token || !chartExerciseId) {
      setExerciseChart([]);
      return;
    }
    void getWorkoutExerciseAnalytics(token, chartExerciseId)
      .then(setExerciseChart)
      .catch(() => setExerciseChart([]));
  }, [token, chartExerciseId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void getWorkoutMuscleGroupAnalytics(token, chartGroup)
      .then(setGroupChart)
      .catch(() => setGroupChart([]));
  }, [token, chartGroup]);

  useEffect(() => {
    if (view !== "history" || chartExerciseId || catalog.length === 0 || sessions.length === 0) {
      return;
    }
    const defaultExerciseId = lastUsedExerciseId(sessions, catalog);
    if (defaultExerciseId) {
      setChartExerciseId(defaultExerciseId);
    }
  }, [view, chartExerciseId, catalog, sessions]);

  useEffect(() => {
    if (step !== "start" || sessions.length === 0) {
      return;
    }
    setStartForm((current) => {
      const nextWeight = prefillBodyWeightFromSessions(sessions, current.bodyWeight);
      if (nextWeight === current.bodyWeight) {
        return current;
      }
      return { ...current, bodyWeight: nextWeight };
    });
  }, [step, sessions]);

  function selectExerciseForChart(exerciseId: string) {
    setChartExerciseId(exerciseId);
    setHistoryTab("progress");
  }

  function setGroupExpanded(group: MuscleGroup, expanded: boolean) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(group);
      } else {
        next.delete(group);
      }
      return next;
    });
  }

  function selectExercise(exerciseId: string) {
    const saved = sessionExercises.find((item) => item.exercise_catalog_id === exerciseId);
    if (saved) {
      setSetCount(saved.sets.length);
      setSetRows(rowsWithKeys(saved.sets));
    } else {
      const priorSets = lastSetsForExercise(sessions, exerciseId, sessionId);
      if (priorSets) {
        setSetCount(priorSets.length);
        setSetRows(rowsWithKeys(priorSets));
      } else {
        setSetRows(rowsWithKeys(buildSetRows(setCount)));
      }
    }
    setSelectedExerciseId(exerciseId);
    const exercise = catalog.find((item) => item.id === exerciseId);
    if (exercise) {
      setExpandedGroups((current) => new Set(current).add(exercise.muscle_group));
    }
  }

  function changeSetCount(nextCount: number) {
    const safeCount = Math.max(1, Math.min(nextCount, 20));
    setSetCount(safeCount);
    setSetRows((current) =>
      rowsWithKeys(buildSetRows(safeCount, current.map(({ weight, reps }) => ({ weight, reps })))),
    );
  }

  function findNextExercise(): string | null {
    if (!selectedExercise) {
      return null;
    }
    const groupItems = catalogByGroup[selectedExercise.muscle_group];
    const currentIndex = groupItems.findIndex((item) => item.id === selectedExerciseId);
    for (let index = currentIndex + 1; index < groupItems.length; index += 1) {
      const item = groupItems[index];
      if (!savedExerciseIds.has(item.id)) {
        return item.id;
      }
    }
    return null;
  }

  function goToNextExercise() {
    const nextId = findNextExercise();
    if (nextId) {
      selectExercise(nextId);
    }
  }

  async function removeSession(targetSessionId: string) {
    if (!token) {
      return;
    }
    setError(null);
    try {
      await deleteWorkoutSession(token, targetSessionId);
      await loadSessions();
      setNotice("Тренировка удалена");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить тренировку."));
    }
  }

  async function startSession() {
    if (!token || isSaving) {
      return;
    }
    const bodyWeight = parseDecimal(startForm.bodyWeight);
    if (bodyWeight <= 0) {
      setError("Укажи вес тела больше нуля.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const session = await createWorkoutSession(token, {
        body_weight: bodyWeight,
        mood: startForm.mood,
        muscle_readiness: startForm.muscleReadiness,
        sleep_quality: startForm.sleepQuality,
        general_fatigue: startForm.generalFatigue,
        exercises: [],
      });
      setSessionId(session.id);
      setSessionExercises([]);
      setExpandedGroups(new Set(["legs"]));
      setStep("workout");
      setNotice("Тренировка начата.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось начать тренировку."));
    } finally {
      setIsSaving(false);
    }
  }

  async function createExercise(group: MuscleGroup) {
    const name = (newExerciseNames[group] ?? "").trim();
    if (!token || !name) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const item = await createWorkoutCatalogItem(token, {
        name,
        muscle_group: group,
      });
      await loadCatalog();
      setNewExerciseNames((current) => ({ ...current, [group]: "" }));
      setExpandedGroups((current) => new Set(current).add(group));
      selectExercise(item.id);
      setNotice(`Упражнение «${item.name}» добавлено.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось создать упражнение."));
    } finally {
      setIsSaving(false);
    }
  }

  function updateSetRow(index: number, patch: Partial<WorkoutSet>) {
    setSetRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function saveExerciseToSession() {
    if (!token || !sessionId || !selectedExerciseId) {
      return;
    }
    const sets = filterCompleteSets(setRows);
    if (sets.length === 0) {
      setError("Добавь хотя бы один подход с весом и повторами.");
      return;
    }
    const exercise = catalog.find((item) => item.id === selectedExerciseId);
    if (!exercise) {
      return;
    }
    const nextExercises = [
      ...sessionExercises.filter((item) => item.exercise_catalog_id !== selectedExerciseId),
      {
        exercise_catalog_id: selectedExerciseId,
        sets,
        name: exercise.name,
        muscle_group: exercise.muscle_group,
      },
    ];
    setIsSaving(true);
    setError(null);
    try {
      await updateWorkoutSession(token, sessionId, {
        exercises: nextExercises.map((item) => ({
          exercise_catalog_id: item.exercise_catalog_id,
          sets: item.sets,
        })),
      });
      setSessionExercises(nextExercises);
      setSetRows(rowsWithKeys(sets));
      setSetCount(sets.length);
      setNotice(`«${exercise.name}» сохранено в тренировке.`);
      await loadSessions();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить упражнение."));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveRecord() {
    if (!token) {
      return;
    }
    const weight = parseDecimal(recordForm.weight);
    const reps = parseInt(recordForm.reps, 10);
    if (!recordForm.exerciseId || weight <= 0 || !Number.isFinite(reps) || reps <= 0) {
      setError("Заполни упражнение, вес и повторы для рекорда.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await createWorkoutRecord(token, {
        exercise_catalog_id: recordForm.exerciseId,
        weight,
        reps,
        date: recordForm.date,
      });
      await loadRecords();
      setRecordForm((current) => ({ ...current, weight: "", reps: "" }));
      setNotice("Рекорд зафиксирован.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить рекорд."));
    } finally {
      setIsSaving(false);
    }
  }

  function clearWizardState() {
    setStep("start");
    setSessionId(null);
    setStartForm(defaultWorkoutStartForm());
    setSessionExercises([]);
    setSelectedExerciseId(null);
    setSetCount(DEFAULT_SET_COUNT);
    setSetRows(rowsWithKeys(buildSetRows(DEFAULT_SET_COUNT)));
    setNewExerciseNames({});
    setExpandedGroups(new Set(["legs"]));
  }

  function resetWizard() {
    clearWizardState();
    setView("wizard");
  }

  function startWorkout() {
    clearWizardState();
    setView("wizard");
    setStep("start");
  }

  function finishWorkout() {
    setStep("summary");
    setNotice(null);
    setError(null);
  }

  const setsEditorProps = {
    selectedExerciseId,
    selectedExerciseName: selectedExercise?.name ?? null,
    setCount,
    setRows,
    records,
    isSaving,
    onSetCountChange: changeSetCount,
    onUpdateSetRow: updateSetRow,
    onSave: () => void saveExerciseToSession(),
    onNext: goToNextExercise,
    hasNext: findNextExercise() !== null,
  };

  return (
    <div className={cn(TRACKING_SHELL, "gap-3")}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Dumbbell className="size-5 text-primary" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Зал</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {view === "history" ? (
            <Button variant="default" size="sm" onClick={startWorkout}>
              <Plus data-icon="inline-start" />
              Новая тренировка
            </Button>
          ) : null}
          <Button variant={view === "wizard" ? "default" : "outline"} size="sm" onClick={() => setView("wizard")}>
            Тренировка
          </Button>
          <Button variant={view === "history" ? "default" : "outline"} size="sm" onClick={() => setView("history")}>
            <BarChart3 data-icon="inline-start" />
            История
          </Button>
        </div>
      </div>

      {notice ? <Notice variant="success">{notice}</Notice> : null}
      {error ? <Notice variant="error">{error}</Notice> : null}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Загрузка">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : null}

      {!isLoading && view === "wizard" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {step === "workout" ? (
            <WorkoutSessionBar
              doneCount={sessionProgress.done}
              totalCount={sessionProgress.total}
              onFinish={finishWorkout}
            />
          ) : null}

          <div
            className={cn(
              "grid min-h-0 w-full flex-1 gap-3",
              step === "workout" && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
              step === "start" && "grid-cols-1",
              step === "summary" && "grid-cols-1",
              TRACKING_SCROLL_COL,
            )}
          >
            {step === "start" ? (
              <WorkoutStartCard
                startForm={startForm}
                sessions={sessions}
                isSaving={isSaving}
                onChange={(patch) => setStartForm((current) => ({ ...current, ...patch }))}
                onStart={() => void startSession()}
              />
            ) : null}

            {step === "workout" ? (
              <>
                <div className="flex min-h-0 flex-col gap-3">
                  <WorkoutMuscleGroupAccordion
                    catalog={catalog}
                    sessionExercises={sessionExercises}
                    expandedGroups={expandedGroups}
                    selectedExerciseId={selectedExerciseId}
                    newExerciseNames={newExerciseNames}
                    isSaving={isSaving}
                    onToggleGroup={setGroupExpanded}
                    onSelectExercise={selectExercise}
                    onNewExerciseNameChange={(group, name) =>
                      setNewExerciseNames((current) => ({ ...current, [group]: name }))
                    }
                    onCreateExercise={(group) => void createExercise(group)}
                  />
                  <div className="lg:hidden">
                    <WorkoutSetsEditor {...setsEditorProps} variant="inline" />
                  </div>
                </div>
                <div className="hidden lg:block">
                  <WorkoutSetsEditor {...setsEditorProps} variant="sidebar" />
                </div>
              </>
            ) : null}

            {step === "summary" ? (
              <WorkoutSessionSummary
                startForm={startForm}
                sessionExercises={sessionExercises}
                sessionId={sessionId}
                sessions={sessions}
                records={records}
                onGoToHistory={() => {
                  clearWizardState();
                  setView("history");
                }}
                onNewWorkout={resetWizard}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {!isLoading && view === "history" ? (
        <WorkoutHistoryView
          historyTab={historyTab}
          catalog={catalog}
          sessions={sessions}
          records={records}
          exerciseChart={exerciseChart}
          groupChart={groupChart}
          chartExerciseId={chartExerciseId}
          chartGroup={chartGroup}
          recordForm={recordForm}
          isSaving={isSaving}
          onHistoryTabChange={setHistoryTab}
          onChartExerciseChange={setChartExerciseId}
          onChartGroupChange={setChartGroup}
          onRecordFormChange={(patch) => setRecordForm((current) => ({ ...current, ...patch }))}
          onSaveRecord={() => void saveRecord()}
          onRemoveSession={(id) => void removeSession(id)}
          onSelectExerciseForChart={selectExerciseForChart}
          onStartWorkout={startWorkout}
        />
      ) : null}
    </div>
  );
}
