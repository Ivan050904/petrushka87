"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isNewPersonalRecord, type PersonalRecord } from "@/lib/workouts";
import { cn } from "@/lib/utils";

import { parseDecimal, parseSetCount, type SetRow } from "./workout-utils";

type WorkoutSetsEditorProps = {
  selectedExerciseId: string | null;
  selectedExerciseName: string | null;
  setCount: number;
  setRows: SetRow[];
  records: PersonalRecord[];
  isSaving: boolean;
  variant: "inline" | "sidebar";
  onSetCountChange: (count: number) => void;
  onUpdateSetRow: (index: number, patch: Partial<{ weight: number; reps: number }>) => void;
  onSave: () => void;
  onNext?: () => void;
  hasNext?: boolean;
};

export function WorkoutSetsEditor({
  selectedExerciseId,
  selectedExerciseName,
  setCount,
  setRows,
  records,
  isSaving,
  variant,
  onSetCountChange,
  onUpdateSetRow,
  onSave,
  onNext,
  hasNext,
}: WorkoutSetsEditorProps) {
  const showPrBadge =
    selectedExerciseId !== null && isNewPersonalRecord(setRows, records, selectedExerciseId);

  return (
    <Card className={cn(variant === "sidebar" && "lg:sticky lg:top-0")}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Подходы</CardTitle>
        {showPrBadge ? (
          <Badge variant="outline" className="border-accent text-accent">
            Новый PR
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!selectedExerciseId ? (
          <Empty title="Выбери упражнение" />
        ) : (
          <>
            {selectedExerciseName ? (
              <p className="text-sm font-medium text-muted-foreground">{selectedExerciseName}</p>
            ) : null}
            <Field>
              <FieldLabel htmlFor={`set-count-${variant}`}>Количество подходов</FieldLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  id={`set-count-${variant}`}
                  value={String(setCount)}
                  onChange={(event) => onSetCountChange(parseSetCount(event.target.value))}
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
                      onClick={() => onSetCountChange(count)}
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
                    onChange={(event) => onUpdateSetRow(index, { weight: parseDecimal(event.target.value) })}
                  />
                </Field>
                <Field>
                  <FieldLabel>Повторы</FieldLabel>
                  <Input
                    inputMode="numeric"
                    value={row.reps > 0 ? String(row.reps) : ""}
                    onChange={(event) => onUpdateSetRow(index, { reps: parseInt(event.target.value, 10) || 0 })}
                  />
                </Field>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button onClick={onSave} disabled={isSaving}>
                {isSaving ? "Сохранение" : "Сохранить упражнение"}
              </Button>
              {hasNext && onNext ? (
                <Button type="button" variant="outline" onClick={onNext}>
                  Следующее
                </Button>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
