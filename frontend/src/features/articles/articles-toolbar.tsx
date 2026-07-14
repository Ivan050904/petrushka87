"use client";

import { Brain, Newspaper, Play, RefreshCw } from "lucide-react";

import type { ArticlesTab } from "@/features/articles/articles-helpers";

type ArticlesToolbarProps = {
  tab: ArticlesTab;
  isRunning: boolean;
  isTuning: boolean;
  runButtonLabel: string;
  onRunDigest: () => void;
  onTuneQueries: () => void;
};

export function ArticlesToolbar({
  tab,
  isRunning,
  isTuning,
  runButtonLabel,
  onRunDigest,
  onTuneQueries,
}: ArticlesToolbarProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {tab === "psychology" ? (
            <Brain className="size-5 text-[var(--articles-accent)]" aria-hidden="true" />
          ) : (
            <Newspaper className="size-5 text-[var(--articles-accent)]" aria-hidden="true" />
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--articles-foreground)]">Статьи</h1>
        </div>
        <p className="max-w-2xl text-sm text-[var(--articles-muted)]">
          {tab === "psychology"
            ? "Англоязычные материалы по CBT, самоценности, схемам, отношениям и ACT из NHS, CCI, APA и научных баз."
            : "Свежие статьи про ИИ-агентов, Cursor, Claude и Codex с Habr."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onTuneQueries}
          disabled={isTuning}
          className="articles-btn-ghost focus-ring inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--articles-border)] px-3 py-2 text-sm font-medium"
        >
          {isTuning ? <RefreshCw className="size-4 animate-spin" /> : null}
          Обновить запросы
        </button>
        <button
          type="button"
          onClick={onRunDigest}
          disabled={isRunning}
          className="articles-btn-primary focus-ring inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
        >
          {isRunning ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4" />}
          {runButtonLabel}
        </button>
      </div>
    </div>
  );
}
