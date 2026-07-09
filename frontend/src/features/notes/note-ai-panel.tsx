"use client";

import type { LifeNoteAnalyzeResponse } from "@/lib/api";
import type { LifeNoteEmotionReview } from "@/lib/life-notes";
import { cn } from "@/lib/utils";

type NoteAiPanelProps = {
  review: LifeNoteEmotionReview | LifeNoteAnalyzeResponse | null;
  isLoading: boolean;
  error: string | null;
  onAnalyze: () => void;
  onQuoteClick?: (quote: string) => void;
  className?: string;
};

export function NoteAiPanel({
  review,
  isLoading,
  error,
  onAnalyze,
  onQuoteClick,
  className,
}: NoteAiPanelProps) {
  return (
    <aside className={cn("notes-ai-panel flex h-full flex-col gap-4 p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--notes-text)]">Эмоциональный разбор</h2>
          <p className="text-xs text-[var(--notes-muted)]">ИИ подскажет, где текст звучит сухо</p>
        </div>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={isLoading}
          className="focus-ring rounded-full bg-[var(--notes-pill-active)] px-3 py-1.5 text-xs font-medium text-[var(--notes-text)] disabled:opacity-60"
        >
          {isLoading ? "Анализ..." : review ? "Проверить снова" : "Проверить эмоции"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {!review && !isLoading && !error ? (
        <p className="text-sm text-[var(--notes-muted)]">
          Нажмите «Проверить эмоции», чтобы получить замечания по сухим местам в тексте.
        </p>
      ) : null}

      {review ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <p className="text-sm leading-relaxed text-[var(--notes-text)]">{review.summary}</p>
          {review.dry_spots.length > 0 ? (
            <div className="space-y-3">
              {review.dry_spots.map((spot, index) => (
                <button
                  key={`${spot.quote}-${index}`}
                  type="button"
                  onClick={() => onQuoteClick?.(spot.quote)}
                  className="focus-ring w-full rounded-xl bg-[var(--notes-bg)] p-3 text-left"
                >
                  <p className="mb-2 text-sm italic text-[var(--notes-text)]">«{spot.quote}»</p>
                  <p className="mb-1 text-xs text-[var(--notes-muted)]">{spot.issue}</p>
                  <p className="text-xs text-[var(--notes-text)]">{spot.suggestion}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--notes-muted)]">Сухих мест почти нет — текст уже живой.</p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
