"use client";

import { AppShell } from "@/components/app-shell";
import { TranscriptionView } from "@/features/transcription/transcription-view";

export default function TranscribePage() {
  return (
    <AppShell contentClassName="min-h-0 flex-1 overflow-hidden p-0">
      <TranscriptionView />
    </AppShell>
  );
}
