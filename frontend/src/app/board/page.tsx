"use client";

import { AppShell } from "@/components/app-shell";
import { ThoughtBoardView } from "@/features/board/thought-board-view";

export default function BoardPage() {
  return (
    <AppShell contentClassName="p-0">
      <ThoughtBoardView />
    </AppShell>
  );
}
