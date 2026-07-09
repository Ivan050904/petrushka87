"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PlansView } from "@/features/plans/plans-view";

export default function PlansPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Загрузка планов...</div>}>
        <PlansView />
      </Suspense>
    </AppShell>
  );
}
