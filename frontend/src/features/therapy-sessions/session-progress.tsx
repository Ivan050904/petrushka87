"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TherapySessionJob } from "@/lib/api";

const STAGES = [
  { key: "upload", label: "Загрузка" },
  { key: "transcribe", label: "Расшифровка" },
  { key: "speakers", label: "Спикеры" },
  { key: "analysis", label: "Анализ" },
  { key: "index", label: "Индекс" },
  { key: "done", label: "Готово" },
];

export function SessionProgress({ job }: { job: TherapySessionJob }) {
  const activeIndex = STAGES.findIndex((stage) => stage.key === job.stage_key);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{job.stage}</span>
        <span className="text-muted-foreground">{job.progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${job.progress}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {STAGES.map((stage, index) => (
          <span
            key={stage.key}
            className={
              index <= activeIndex
                ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            }
          >
            {stage.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SessionProgressCard({ job }: { job: TherapySessionJob }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Прогресс</CardTitle>
      </CardHeader>
      <CardContent>
        <SessionProgress job={job} />
      </CardContent>
    </Card>
  );
}
