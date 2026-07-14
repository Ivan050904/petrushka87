"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PlansView } from "@/features/plans/plans-view";

export default function PlansPage() {
  return (
    <AppShell contentClassName="min-h-0 flex-1 overflow-hidden">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Загрузка планов...</div>}>
        <PlansView />
      </Suspense>
    </AppShell>
  );
}
