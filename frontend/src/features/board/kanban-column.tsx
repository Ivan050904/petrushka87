"use client";

import type { DragEvent, ReactNode } from "react";
import { Plus } from "lucide-react";

import { KanbanProjectPicker } from "@/features/board/kanban-project-picker";
import { KanbanCard } from "@/features/board/kanban-card";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { DevKanbanColumn, KanbanBoardConfig, KanbanCardTypeOption, KanbanStage } from "@/lib/kanban-boards";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type KanbanColumnProps = {
  column: DevKanbanColumn;
  boardConfig: KanbanBoardConfig;
  entries: Entry[];
  isDropTarget: boolean;
  movingEntryId: string | null;
  isAdding: boolean;
  quickDraft: string;
  addPlaceholder: string;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onOpenEntry: (entry: Entry) => void;
  onDragStart: (event: DragEvent<HTMLElement>, entry: Entry) => void;
  onStartAdding: () => void;
  onQuickDraftChange: (value: string) => void;
  onSubmitQuickAdd: () => void;
  onCancelQuickAdd: () => void;
  createProjects: KanbanCardTypeOption[];
  showCreateProjectPicker: boolean;
  createCardProject: string;
  onCreateCardProjectChange: (value: string) => void;
};

export function KanbanColumn({
  column,
  boardConfig,
  entries,
  isDropTarget,
  movingEntryId,
  isAdding,
  quickDraft,
  addPlaceholder,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenEntry,
  onDragStart,
  onStartAdding,
  onQuickDraftChange,
  onSubmitQuickAdd,
  onCancelQuickAdd,
  createProjects,
  showCreateProjectPicker,
  createCardProject,
  onCreateCardProjectChange,
}: KanbanColumnProps) {
  return (
    <section
      className={cn(
        "kanban-column flex h-full max-h-full w-[min(100%,19rem)] shrink-0 flex-col rounded-xl border",
        isDropTarget && "ring-2 ring-[var(--kanban-accent)]/35",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--kanban-border)] px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", column.dotColor)} aria-hidden="true" />
          <h2 className="truncate text-sm font-semibold text-[var(--kanban-foreground)]">{column.label}</h2>
          <span className="rounded-full border border-[var(--kanban-border)] bg-[var(--kanban-panel)] px-2 py-0.5 text-xs font-medium text-[var(--kanban-muted)]">
            {entries.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--kanban-border)] px-3 py-8 text-center text-sm text-[var(--kanban-muted)]">
            {column.emptyHint}
          </div>
        ) : (
          entries.map((entry) => (
            <KanbanCard
              key={entry.id}
              entry={entry}
              boardConfig={boardConfig}
              isMoving={movingEntryId === entry.id}
              onOpen={() => onOpenEntry(entry)}
              onDragStart={(event) => onDragStart(event, entry)}
            />
          ))
        )}
      </div>

      {isAdding ? (
        <div className="border-t border-[var(--kanban-border)] p-2">
          <FieldLabel htmlFor={`kanban-quick-add-${column.id}`} className="sr-only">
            Новая карточка
          </FieldLabel>
          {showCreateProjectPicker ? (
            <KanbanProjectPicker
              id={`kanban-quick-add-project-${column.id}`}
              projects={createProjects}
              value={createCardProject}
              onChange={onCreateCardProjectChange}
            />
          ) : null}
          <Textarea
            id={`kanban-quick-add-${column.id}`}
            value={quickDraft}
            onChange={(event) => onQuickDraftChange(event.target.value)}
            placeholder={addPlaceholder}
            rows={3}
            className="kanban-toolbar-input text-sm"
            autoFocus
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={onSubmitQuickAdd} disabled={!quickDraft.trim()}>
              Добавить
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelQuickAdd}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartAdding}
          className="focus-ring flex items-center gap-2 rounded-b-xl border-t border-[var(--kanban-border)] px-3 py-2.5 text-sm text-[var(--kanban-muted)] transition hover:bg-[var(--kanban-panel-hover)] hover:text-[var(--kanban-foreground)]"
        >
          <Plus className="size-4" />
          Добавить задачу
        </button>
      )}
    </section>
  );
}
