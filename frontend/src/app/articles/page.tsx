"use client";

import { AppShell } from "@/components/app-shell";
import { ArticlesPanel } from "@/features/articles/articles-panel";

export default function ArticlesPage() {
  return (
    <AppShell contentClassName="min-h-0 overflow-y-auto p-0">
      <ArticlesPanel />
    </AppShell>
  );
}
