"use client";

import { useMemo, useState } from "react";
import { Plus, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExerciseCatalogItem, PersonalRecord } from "@/lib/workouts";

type WorkoutHistoryRecordsProps = {
  catalog: ExerciseCatalogItem[];
  records: PersonalRecord[];
  recordForm: { exerciseId: string; weight: string; reps: string; date: string };
  isSaving: boolean;
  onRecordFormChange: (patch: Partial<{ exerciseId: string; weight: string; reps: string; date: string }>) => void;
  onSaveRecord: () => void;
};

export function WorkoutHistoryRecords({
  catalog,
  records,
  recordForm,
  isSaving,
  onRecordFormChange,
  onSaveRecord,
}: WorkoutHistoryRecordsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.weight - a.weight || b.date.localeCompare(a.date)),
    [records],
  );

  function handleSave() {
    onSaveRecord();
    setDialogOpen(false);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4" />
          Личные рекорды ({records.length})
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Plus data-icon="inline-start" />
              Добавить
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новый рекорд</DialogTitle>
            </DialogHeader>
            <FieldGroup className="gap-2">
              <Select
                value={recordForm.exerciseId}
                onChange={(event) => onRecordFormChange({ exerciseId: event.target.value })}
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
                  onChange={(event) => onRecordFormChange({ weight: event.target.value })}
                />
                <Input
                  inputMode="numeric"
                  placeholder="Повторы"
                  value={recordForm.reps}
                  onChange={(event) => onRecordFormChange({ reps: event.target.value })}
                />
                <Input
                  type="date"
                  value={recordForm.date}
                  onChange={(event) => onRecordFormChange({ date: event.target.value })}
                />
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Сохранение" : "Зафиксировать"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedRecords.length === 0 ? (
          <Empty
            title="Рекордов пока нет"
            description="Они появятся после тренировок или добавь вручную через «Добавить»."
          />
        ) : (
          sortedRecords.map((record) => (
            <div key={record.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{record.exercise_name ?? "Упражнение"}</div>
                <div className="text-muted-foreground">{record.date}</div>
              </div>
              <Badge variant="outline">
                {record.weight} кг × {record.reps}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
