"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, LineChart, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty } from "@/components/ui/empty";
import { WorkoutMetricBar } from "@/features/workouts/workout-metric-bar";
import { formatDate } from "@/lib/entry-helpers";
import {
  formatMuscleGroup,
  formatVolume,
  groupSessionExercisesByMuscle,
  maxSetWeight,
  sessionMuscleGroups,
  sessionPreviewLabel,
  sessionToExerciseEntries,
  sessionTotalVolume,
  type WorkoutSession,
} from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WorkoutHistorySessionsProps = {
  sessions: WorkoutSession[];
  onRemoveSession: (sessionId: string) => void;
  onSelectExerciseForChart: (exerciseId: string) => void;
};

export function WorkoutHistorySessions({
  sessions,
  onRemoveSession,
  onSelectExerciseForChart,
}: WorkoutHistorySessionsProps) {
  const [hideEmpty, setHideEmpty] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const visibleSessions = useMemo(
    () => (hideEmpty ? sessions.filter((session) => session.exercises.length > 0) : sessions),
    [hideEmpty, sessions],
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Тренировки ({visibleSessions.length})</CardTitle>
        <Button
          type="button"
          size="sm"
          variant={hideEmpty ? "default" : "outline"}
          onClick={() => setHideEmpty((current) => !current)}
        >
          {hideEmpty ? "Скрыты пустые" : "Показать пустые"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0">
        {visibleSessions.length === 0 ? (
          <Empty title="Тренировок пока нет" />
        ) : (
          visibleSessions.map((session) => {
            const isExpanded = expandedId === session.id;
            const volume = sessionTotalVolume(session.exercises);
            const groups = sessionMuscleGroups(session);
            const exerciseEntries = sessionToExerciseEntries(session);
            const grouped = groupSessionExercisesByMuscle(exerciseEntries);

            return (
              <Collapsible
                key={session.id}
                open={isExpanded}
                onOpenChange={(open) => setExpandedId(open ? session.id : null)}
              >
                <div className="rounded-md border border-border">
                  <div className="flex items-start gap-2 px-3 py-2">
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="mt-0.5 size-8 shrink-0">
                        {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{formatDate(session.date)}</div>
                      <div className="truncate text-muted-foreground">{sessionPreviewLabel(session)}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary">{session.body_weight} кг</Badge>
                        {volume > 0 ? <Badge variant="outline">{formatVolume(volume)}</Badge> : null}
                        {groups.length > 0 ? <Badge variant="outline">{groups.length} групп</Badge> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Удалить тренировку"
                        onClick={() => setPendingDeleteId(session.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="space-y-3 border-t border-border px-3 py-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <WorkoutMetricBar label="Настроение" value={session.mood} />
                        <WorkoutMetricBar label="Готовность мышц" value={session.muscle_readiness} />
                        <WorkoutMetricBar label="Качество сна" value={session.sleep_quality} />
                        <WorkoutMetricBar label="Общая усталость" value={session.general_fatigue} invert />
                      </div>

                      {grouped.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Упражнения не сохранены.</p>
                      ) : (
                        grouped.map(({ group, items }) => (
                          <div key={group} className="space-y-2">
                            <h4 className="text-sm font-medium">{formatMuscleGroup(group)}</h4>
                            {items.map((item) => {
                              const maxWeight = maxSetWeight(item.sets);
                              return (
                                <div key={item.exercise_catalog_id} className="rounded-md border border-border px-3 py-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      className={cn(
                                        "focus-ring flex items-center gap-1 text-left text-sm font-medium hover:text-primary",
                                      )}
                                      onClick={() => onSelectExerciseForChart(item.exercise_catalog_id)}
                                    >
                                      {item.name}
                                      <LineChart className="size-3.5 text-muted-foreground" aria-hidden="true" />
                                    </button>
                                    {maxWeight !== null ? (
                                      <span className="text-xs tabular-nums text-muted-foreground">max {maxWeight} кг</span>
                                    ) : null}
                                  </div>
                                  <div className="mt-1 space-y-0.5">
                                    {item.sets.map((set, index) => (
                                      <div
                                        key={`${item.exercise_catalog_id}-${index}`}
                                        className="flex gap-3 text-sm tabular-nums text-muted-foreground"
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
                        ))
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })
        )}
      </CardContent>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тренировку?</AlertDialogTitle>
            <AlertDialogDescription>Запись исчезнет из истории. Это действие нельзя отменить.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) {
                  onRemoveSession(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
