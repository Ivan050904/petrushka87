"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ReferenceView } from "@/features/reference/reference-view";

export default function ReferencePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Загрузка справочника...</div>}>
        <ReferenceView />
      </Suspense>
    </AppShell>
  );
}
