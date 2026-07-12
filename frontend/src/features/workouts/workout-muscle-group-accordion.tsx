"use client";

import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  countGroupExercisesDone,
  formatMuscleGroup,
  formatSetsSummary,
  groupCatalogByMuscle,
  MUSCLE_GROUPS,
  type ExerciseCatalogItem,
  type MuscleGroup,
  type SessionExerciseEntry,
} from "@/lib/workouts";
import { cn } from "@/lib/utils";

type WorkoutMuscleGroupAccordionProps = {
  catalog: ExerciseCatalogItem[];
  sessionExercises: SessionExerciseEntry[];
  expandedGroups: Set<MuscleGroup>;
  selectedExerciseId: string | null;
  newExerciseNames: Partial<Record<MuscleGroup, string>>;
  isSaving: boolean;
  onToggleGroup: (group: MuscleGroup, expanded: boolean) => void;
  onSelectExercise: (exerciseId: string) => void;
  onNewExerciseNameChange: (group: MuscleGroup, name: string) => void;
  onCreateExercise: (group: MuscleGroup) => void;
};

export function WorkoutMuscleGroupAccordion({
  catalog,
  sessionExercises,
  expandedGroups,
  selectedExerciseId,
  newExerciseNames,
  isSaving,
  onToggleGroup,
  onSelectExercise,
  onNewExerciseNameChange,
  onCreateExercise,
}: WorkoutMuscleGroupAccordionProps) {
  const catalogByGroup = groupCatalogByMuscle(catalog);
  const sessionByExerciseId = new Map(sessionExercises.map((item) => [item.exercise_catalog_id, item]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Группы мышц</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {MUSCLE_GROUPS.map((group) => {
          const items = catalogByGroup[group];
          const { done, total } = countGroupExercisesDone(group, sessionExercises, catalog);
          const isExpanded = expandedGroups.has(group);

          return (
            <Collapsible key={group} open={isExpanded} onOpenChange={(open) => onToggleGroup(group, open)}>
              <div className="rounded-md border border-border">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm font-medium">{formatMuscleGroup(group)}</span>
                  {total > 0 ? (
                    <Badge variant="secondary" className="tabular-nums">
                      {done}/{total}
                    </Badge>
                  ) : null}
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={isExpanded ? `Свернуть ${formatMuscleGroup(group)}` : `Развернуть ${formatMuscleGroup(group)}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-4" aria-hidden="true" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </div>

                <CollapsibleContent>
                  <div className="space-y-1 border-t border-border px-2 py-2">
                    {items.length === 0 ? (
                      <p className="px-2 py-1 text-sm text-muted-foreground">Нет упражнений — создай первое ниже.</p>
                    ) : (
                      items.map((item) => {
                        const saved = sessionByExerciseId.get(item.id);
                        const isSelected = selectedExerciseId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectExercise(item.id)}
                            className={cn(
                              "focus-ring flex w-full flex-col rounded-md border px-3 py-2 text-left transition-colors",
                              isSelected
                                ? "border-primary/50 bg-primary/12 text-primary"
                                : "border-transparent hover:bg-muted",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {saved ? (
                                <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                              ) : (
                                <span className="size-4 shrink-0" aria-hidden="true" />
                              )}
                              <span className="text-sm font-medium">{item.name}</span>
                            </div>
                            {saved ? (
                              <span className="mt-0.5 pl-6 text-xs text-muted-foreground">
                                {formatSetsSummary(saved.sets)}
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                    <div className="flex gap-2 px-1 pt-1">
                      <Input
                        placeholder="Новое упражнение"
                        value={newExerciseNames[group] ?? ""}
                        onChange={(event) => onNewExerciseNameChange(group, event.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => onCreateExercise(group)}
                        disabled={isSaving || !(newExerciseNames[group] ?? "").trim()}
                      >
                        <Plus data-icon="inline-start" />
                        Создать
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
