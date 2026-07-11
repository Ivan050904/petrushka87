"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Dumbbell, LineChart, Plus, Scale, Trophy } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { TRACKING_SCROLL_COL, TRACKING_SHELL } from "@/features/tracking/tracking-layout";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  createWorkoutCatalogItem,
  createWorkoutRecord,
  createWorkoutSession,
  getErrorMessage,
  getWorkoutExerciseAnalytics,
  getWorkoutMuscleGroupAnalytics,
  listWorkoutCatalog,
  listWorkoutRecords,
  listWorkoutSessions,
  updateWorkoutSession,
} from "@/lib/api";
import { formatDate } from "@/lib/entry-helpers";
import {
  bodyWeightProgressPoints,
  buildSetRows,
  defaultWorkoutStartForm,
  DEFAULT_SET_COUNT,
  filterCompleteSets,
  formatMuscleGroup,
  MUSCLE_GROUPS,
  type ExerciseCatalogItem,
  type MuscleGroup,
  type PersonalRecord,
  type ProgressPoint,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutStartForm,
} from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WizardStep = "start" | "workout" | "history";

type SetRow = WorkoutSet & { key: string };

function rowsWithKeys(sets: WorkoutSet[]): SetRow[] {
  return sets.map((set) => ({ ...set, key: crypto.randomUUID() }));
}

function parseSetCount(value: string): number {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SET_COUNT;
  }
  return Math.max(1, Math.min(parsed, 20));
}

function parseDecimal(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function WorkoutsPanel() {
  const { token } = useRequireAuth();
  const [step, setStep] = useState<WizardStep>("start");
  const [view, setView] = useState<"wizard" | "history">("wizard");
  const [startForm, setStartForm] = useState<WorkoutStartForm>(defaultWorkoutStartForm());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("legs");
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [setCount, setSetCount] = useState(DEFAULT_SET_COUNT);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [setRows, setSetRows] = useState<SetRow[]>(() => rowsWithKeys(buildSetRows(DEFAULT_SET_COUNT)));
  const [sessionExercises, setSessionExercises] = useState<
    Array<{ exercise_catalog_id: string; sets: WorkoutSet[]; name: string; muscle_group: MuscleGroup }>
  >([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [exerciseChart, setExerciseChart] = useState<ProgressPoint[]>([]);
  const [groupChart, setGroupChart] = useState<ProgressPoint[]>([]);
  const [chartExerciseId, setChartExerciseId] = useState<string>("");
  const [chartGroup, setChartGroup] = useState<MuscleGroup>("legs");
  const [recordForm, setRecordForm] = useState({ exerciseId: "", weight: "", reps: "", date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const catalogForGroup = useMemo(
    () => catalog.filter((item) => item.muscle_group === muscleGroup),
    [catalog, muscleGroup],
  );

  const bodyWeightChart = useMemo(() => bodyWeightProgressPoints(sessions), [sessions]);

  function selectExercise(exerciseId: string) {
    const saved = sessionExercises.find((item) => item.exercise_catalog_id === exerciseId);
    if (saved) {
      setSetCount(saved.sets.length);
      setSetRows(rowsWithKeys(saved.sets));
    } else {
      setSetRows(rowsWithKeys(buildSetRows(setCount)));
    }
    setSelectedExerciseId(exerciseId);
  }

  function changeSetCount(nextCount: number) {
    const safeCount = Math.max(1, Math.min(nextCount, 20));
    setSetCount(safeCount);
    setSetRows((current) =>
      rowsWithKeys(buildSetRows(safeCount, current.map(({ weight, reps }) => ({ weight, reps })))),
    );
  }

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
      setStep("workout");
      setNotice("Тренировка начата.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось начать тренировку."));
    } finally {
      setIsSaving(false);
    }
  }

  async function createExercise() {
    if (!token || !newExerciseName.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const item = await createWorkoutCatalogItem(token, {
        name: newExerciseName.trim(),
        muscle_group: muscleGroup,
      });
      await loadCatalog();
      setSelectedExerciseId(item.id);
      setSetRows(rowsWithKeys(buildSetRows(setCount)));
      setNewExerciseName("");
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
      setSelectedExerciseId(null);
      setSetRows(rowsWithKeys(buildSetRows(setCount)));
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

  function resetWizard() {
    setStep("start");
    setSessionId(null);
    setStartForm(defaultWorkoutStartForm());
    setSessionExercises([]);
    setSelectedExerciseId(null);
    setSetCount(DEFAULT_SET_COUNT);
    setSetRows(rowsWithKeys(buildSetRows(DEFAULT_SET_COUNT)));
    setView("wizard");
  }

  return (
    <div className={cn(TRACKING_SHELL, "gap-3")}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Dumbbell className="size-5 text-primary" aria-hidden="true" />
          <h1 className="text-lg font-semibold">Зал</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === "wizard" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("wizard")}
          >
            Тренировка
          </Button>
          <Button
            variant={view === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("history")}
          >
            <BarChart3 data-icon="inline-start" />
            История
          </Button>
        </div>
      </div>

      {notice ? <Notice variant="success">{notice}</Notice> : null}
      {error ? <Notice variant="error">{error}</Notice> : null}

      {isLoading ? <div className="h-24 rounded-md bg-muted" /> : null}

      {!isLoading && view === "wizard" ? (
        <div className={cn("grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]", TRACKING_SCROLL_COL)}>
          {step === "start" ? (
            <Card>
              <CardHeader>
                <CardTitle>Начало тренировки</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="body-weight">Вес тела, кг</FieldLabel>
                    <Input
                      id="body-weight"
                      inputMode="decimal"
                      value={startForm.bodyWeight}
                      onChange={(event) => setStartForm((current) => ({ ...current, bodyWeight: event.target.value }))}
                    />
                  </Field>
                  {(["mood", "muscleReadiness", "sleepQuality", "generalFatigue"] as const).map((field) => {
                    const labels: Record<typeof field, string> = {
                      mood: "Настроение",
                      muscleReadiness: "Готовность мышц",
                      sleepQuality: "Качество сна",
                      generalFatigue: "Общая усталость",
                    };
                    return (
                      <Field key={field}>
                        <FieldLabel htmlFor={field}>
                          {labels[field]}: {startForm[field]}
                        </FieldLabel>
                        <input
                          id={field}
                          type="range"
                          min={1}
                          max={10}
                          value={startForm[field]}
                          onChange={(event) =>
                            setStartForm((current) => ({ ...current, [field]: Number(event.target.value) }))
                          }
                          className="w-full"
                        />
                      </Field>
                    );
                  })}
                  <Button onClick={() => void startSession()} disabled={isSaving}>
                    {isSaving ? "Сохранение" : "Начать тренировку"}
                  </Button>
                </FieldGroup>
              </CardContent>
            </Card>
          ) : null}

          {step === "workout" ? (
            <>
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Группа мышц</CardTitle>
                  <Button variant="outline" size="sm" onClick={resetWizard}>
                    Завершить
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {MUSCLE_GROUPS.map((group) => (
                      <Button
                        key={group}
                        size="sm"
                        variant={muscleGroup === group ? "default" : "outline"}
                        onClick={() => {
                          setMuscleGroup(group);
                          setSelectedExerciseId(null);
                        }}
                      >
                        {formatMuscleGroup(group)}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {catalogForGroup.length === 0 ? (
                      <Empty title="Нет упражнений" description="Создай первое упражнение для этой группы." />
                    ) : (
                      catalogForGroup.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectExercise(item.id)}
                          className={cn(
                            "focus-ring flex w-full rounded-md border px-3 py-2 text-left",
                            selectedExerciseId === item.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                          )}
                        >
                          {item.name}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Новое упражнение"
                      value={newExerciseName}
                      onChange={(event) => setNewExerciseName(event.target.value)}
                    />
                    <Button variant="outline" onClick={() => void createExercise()} disabled={isSaving}>
                      <Plus data-icon="inline-start" />
                      Создать
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Подходы</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!selectedExerciseId ? (
                    <Empty title="Выбери упражнение" />
                  ) : (
                    <>
                      <Field>
                        <FieldLabel htmlFor="set-count">Количество подходов</FieldLabel>
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            id="set-count"
                            value={String(setCount)}
                            onChange={(event) => changeSetCount(parseSetCount(event.target.value))}
                            className="w-24"
                          >
                            {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                              <option key={count} value={count}>
                                {count}
                              </option>
                            ))}
                          </Select>
                          <div className="flex flex-wrap gap-1">
                            {[3, 4, 5, 6].map((count) => (
                              <Button
                                key={count}
                                type="button"
                                size="sm"
                                variant={setCount === count ? "default" : "outline"}
                                onClick={() => changeSetCount(count)}
                              >
                                {count}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </Field>
                      {setRows.map((row, index) => (
                        <div key={row.key} className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                          <span className="pb-2 text-xs font-medium text-muted-foreground">#{index + 1}</span>
                          <Field>
                            <FieldLabel>Вес, кг</FieldLabel>
                            <Input
                              inputMode="decimal"
                              value={row.weight > 0 ? String(row.weight) : ""}
                              onChange={(event) =>
                                updateSetRow(index, { weight: parseDecimal(event.target.value) })
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel>Повторы</FieldLabel>
                            <Input
                              inputMode="numeric"
                              value={row.reps > 0 ? String(row.reps) : ""}
                              onChange={(event) =>
                                updateSetRow(index, { reps: parseInt(event.target.value, 10) || 0 })
                              }
                            />
                          </Field>
                        </div>
                      ))}
                      <Button onClick={() => void saveExerciseToSession()} disabled={isSaving}>
                        {isSaving ? "Сохранение" : "Сохранить упражнение"}
                      </Button>
                    </>
                  )}
                  {sessionExercises.length > 0 ? (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-sm font-medium">В этой тренировке</p>
                      {sessionExercises.map((item) => (
                        <div key={item.exercise_catalog_id} className="rounded-md border px-3 py-2 text-sm">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-muted-foreground">
                            {item.sets.map((set) => `${set.weight}×${set.reps}`).join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      ) : null}

      {!isLoading && view === "history" ? (
        <div className={cn("grid min-h-0 flex-1 gap-3 xl:grid-cols-2", TRACKING_SCROLL_COL)}>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="size-4" />
                История веса тела
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BodyWeightChartPanel data={bodyWeightChart} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="size-4" />
                Прогресс по упражнению
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={chartExerciseId}
                onChange={(event) => setChartExerciseId(event.target.value)}
              >
                <option value="">Выбери упражнение</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({formatMuscleGroup(item.muscle_group)})
                  </option>
                ))}
              </Select>
              <ChartPanel data={exerciseChart} emptyLabel="Нет данных по упражнению" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="size-4" />
                Прогресс по группе
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={chartGroup} onChange={(event) => setChartGroup(event.target.value as MuscleGroup)}>
                {MUSCLE_GROUPS.map((group) => (
                  <option key={group} value={group}>
                    {formatMuscleGroup(group)}
                  </option>
                ))}
              </Select>
              <ChartPanel data={groupChart} emptyLabel="Нет данных по группе" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>История тренировок ({sessions.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 space-y-2 overflow-y-auto">
              {sessions.length === 0 ? (
                <Empty title="Тренировок пока нет" />
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="font-medium">{formatDate(session.date)}</div>
                    <div className="text-muted-foreground">
                      {session.body_weight} кг · {session.exercises.length} упражн.
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-4" />
                Личные рекорды
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FieldGroup className="gap-2">
                <Select
                  value={recordForm.exerciseId}
                  onChange={(event) => setRecordForm((current) => ({ ...current, exerciseId: event.target.value }))}
                >
                  <option value="">Упражнение</option>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder="Вес"
                    value={recordForm.weight}
                    onChange={(event) => setRecordForm((current) => ({ ...current, weight: event.target.value }))}
                  />
                  <Input
                    inputMode="numeric"
                    placeholder="Повторы"
                    value={recordForm.reps}
                    onChange={(event) => setRecordForm((current) => ({ ...current, reps: event.target.value }))}
                  />
                  <Input
                    type="date"
                    value={recordForm.date}
                    onChange={(event) => setRecordForm((current) => ({ ...current, date: event.target.value }))}
                  />
                </div>
                <Button size="sm" onClick={() => void saveRecord()} disabled={isSaving}>
                  Зафиксировать рекорд
                </Button>
              </FieldGroup>
              <div className="space-y-2">
                {records.map((record) => (
                  <div key={record.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{record.exercise_name ?? "Упражнение"}</div>
                      <div className="text-muted-foreground">{record.date}</div>
                    </div>
                    <Badge variant="outline">
                      {record.weight} кг × {record.reps}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function BodyWeightChartPanel({ data }: { data: ReturnType<typeof bodyWeightProgressPoints> }) {
  if (data.length === 0) {
    return <Empty title="Нет данных о весе тела" description="Заполни вес при начале тренировки." />;
  }

  const chartData = data.map((point) => ({
    date: point.date.slice(5),
    bodyWeight: point.body_weight,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={["dataMin - 2", "dataMax + 2"]} unit=" кг" />
          <Tooltip formatter={(value: number) => [`${value} кг`, "Вес тела"]} />
          <Line type="monotone" dataKey="bodyWeight" stroke="hsl(var(--primary))" strokeWidth={2} dot />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartPanel({ data, emptyLabel }: { data: ProgressPoint[]; emptyLabel: string }) {
  if (data.length === 0) {
    return <Empty title={emptyLabel} />;
  }

  const chartData = data.map((point) => ({
    date: point.date.slice(5),
    maxWeight: point.max_weight,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value: number) => [`${value} кг`, "Макс. вес"]} />
          <Line type="monotone" dataKey="maxWeight" stroke="hsl(var(--primary))" strokeWidth={2} dot />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
