"use client";

import type { Entry } from "@/lib/types";

import { NoteCard } from "@/features/notes/note-card";

type NotesGridProps = {
  entries: Entry[];
  onSelect: (entryId: string) => void;
};

export function NotesGrid({ entries, onSelect }: NotesGridProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-sm text-[var(--notes-muted)]">
        Заметок пока нет. Нажмите «+», чтобы создать первую.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 px-4 pb-28 sm:grid-cols-2 lg:px-6">
      {entries.map((entry) => (
        <NoteCard key={entry.id} entry={entry} onClick={() => onSelect(entry.id)} />
      ))}
    </div>
  );
}
