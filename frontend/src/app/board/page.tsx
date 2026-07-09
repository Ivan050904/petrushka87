"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { DevKanbanView } from "@/features/board/dev-kanban-view";

function BoardFallback() {
  return (
    <div className="kanban-surface flex min-h-0 flex-1 items-center justify-center text-sm text-[var(--kanban-muted)]">
      Загружаем канбан...
    </div>
  );
}

export default function BoardPage() {
  return (
    <AppShell contentClassName="p-0">
      <Suspense fallback={<BoardFallback />}>
        <DevKanbanView />
      </Suspense>
    </AppShell>
  );
}
