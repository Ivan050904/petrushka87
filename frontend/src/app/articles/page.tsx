"use client";

import { AppShell } from "@/components/app-shell";
import { ArticlesPanel } from "@/features/articles/articles-panel";

export default function ArticlesPage() {
  return (
    <AppShell>
      <ArticlesPanel />
    </AppShell>
  );
}
