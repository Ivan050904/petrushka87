"use client";

import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

type NotesFabProps = {
  onClick: () => void;
  className?: string;
};

export function NotesFab({ onClick, className }: NotesFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Создать заметку"
      className={cn(
        "notes-fab focus-ring fixed bottom-[calc(var(--shell-mobile-tab)+1rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full lg:bottom-8 lg:right-8",
        className,
      )}
    >
      <Plus className="size-7" strokeWidth={2.5} />
    </button>
  );
}
