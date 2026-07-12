"use client";

import { Search } from "lucide-react";

import { DEFAULT_LIFE_NOTE_CATEGORY } from "@/lib/life-notes";
import { cn } from "@/lib/utils";

type NotesHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  categories: string[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  total: number | null;
};

export function NotesHeader({
  query,
  onQueryChange,
  categories,
  activeCategory,
  onCategoryChange,
  total,
}: NotesHeaderProps) {
  const pills = ["Все", ...categories.filter((category) => category !== DEFAULT_LIFE_NOTE_CATEGORY), DEFAULT_LIFE_NOTE_CATEGORY]
    .filter((value, index, array) => array.indexOf(value) === index);

  return (
    <header className="sticky top-0 z-20 bg-[var(--notes-bg)]/95 px-3 pb-2 pt-2 backdrop-blur lg:px-6 lg:pb-3 lg:pt-4">
      <div className="mb-3 hidden items-end justify-between gap-3 lg:flex">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--notes-text)]">Заметки</h1>
          {total !== null ? (
            <p className="mt-1 text-sm text-[var(--notes-muted)]">{formatNotesCount(total)}</p>
          ) : null}
        </div>
      </div>

      <label className="notes-search mb-3 flex items-center gap-3 px-3 py-2.5 lg:mb-4 lg:px-4 lg:py-3">
        <Search className="size-5 shrink-0 text-[var(--notes-muted)]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Поиск заметок"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>

      <div className="scrollbar-hidden flex gap-2 overflow-x-auto pb-1">
        {pills.map((pill) => {
          const isAll = pill === "Все";
          const isActive = isAll ? activeCategory === null : activeCategory === pill;
          return (
            <button
              key={pill}
              type="button"
              onClick={() => onCategoryChange(isAll ? null : pill)}
              className={cn("notes-pill focus-ring", isActive && "notes-pill-active")}
            >
              {pill}
            </button>
          );
        })}
      </div>
    </header>
  );
}

function formatNotesCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} заметка`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} заметки`;
  }
  return `${count} заметок`;
}
