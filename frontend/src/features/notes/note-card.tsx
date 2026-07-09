"use client";

import type { Entry } from "@/lib/types";
import {
  formatLifeNoteCardTitle,
  formatLifeNoteShortTime,
  getLifeNoteDisplayTitle,
  lifeNotePreview,
} from "@/lib/life-notes";
import { cn } from "@/lib/utils";

type NoteCardProps = {
  entry: Entry;
  onClick: () => void;
};

export function NoteCard({ entry, onClick }: NoteCardProps) {
  const preview = lifeNotePreview(entry.content);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("notes-card focus-ring flex min-h-[148px] w-full flex-col gap-3 p-4 text-left")}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold leading-snug text-[var(--notes-text)]">
          {getLifeNoteDisplayTitle(entry)}
        </h2>
        <span className="shrink-0 text-xs text-[var(--notes-muted)]">
          {formatLifeNoteShortTime(entry.updated_at)}
        </span>
      </div>
      <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--notes-muted)]">
        {preview || "Пустая заметка"}
      </p>
    </button>
  );
}
