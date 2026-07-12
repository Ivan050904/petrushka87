import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { TherapySessionsView } from "@/features/therapy-sessions/therapy-sessions-view";

export default function TherapySessionsPage() {
  return (
    <AppShell contentClassName="min-h-0 overflow-y-auto p-0">
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Загрузка...</div>}>
        <TherapySessionsView />
      </Suspense>
    </AppShell>
  );
}
