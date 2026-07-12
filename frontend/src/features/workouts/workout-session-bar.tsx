"use client";

import { Button } from "@/components/ui/button";

type WorkoutSessionBarProps = {
  doneCount: number;
  totalCount: number;
  onFinish: () => void;
};

export function WorkoutSessionBar({ doneCount, totalCount, onFinish }: WorkoutSessionBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
      <p className="text-sm text-muted-foreground">
        Тренировка ·{" "}
        <span className="font-medium text-foreground">
          {doneCount}/{totalCount}
        </span>{" "}
        упражнений
      </p>
      <Button variant="outline" size="sm" onClick={onFinish}>
        Завершить
      </Button>
    </div>
  );
}
