"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { NotesView } from "@/features/notes/notes-view";

function NotesFallback() {
  return (
    <div className="notes-surface flex min-h-0 flex-1 items-center justify-center text-sm text-[var(--notes-muted)]">
      Загружаем заметки...
    </div>
  );
}

export default function NotesPage() {
  return (
    <AppShell contentClassName="p-0">
      <Suspense fallback={<NotesFallback />}>
        <NotesView />
      </Suspense>
    </AppShell>
  );
}
