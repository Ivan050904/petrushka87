"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { TrackingView } from "@/features/tracking/tracking-view";

function TrackingFallback() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3" aria-busy="true" aria-label="Загрузка трекинга">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-8 w-24 rounded-md bg-muted xl:h-9 xl:w-28" />
        ))}
      </div>
      <div className="grid gap-3 xl:min-h-[calc(100dvh-10rem)] xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <div className="min-h-72 rounded-md border border-border bg-muted/50 xl:min-h-0" />
        <div className="flex min-h-72 flex-col gap-3 xl:min-h-0">
          <div className="h-16 rounded-md border border-border bg-muted/50" />
          <div className="min-h-0 flex-1 rounded-md border border-border bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

export default function TrackingPage() {
  return (
    <AppShell>
      <Suspense fallback={<TrackingFallback />}>
        <TrackingView />
      </Suspense>
    </AppShell>
  );
}
