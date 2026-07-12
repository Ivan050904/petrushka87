"use client";

import type { DragEvent, KeyboardEvent } from "react";
import { CalendarDays, CheckSquare } from "lucide-react";

import { KanbanPriorityBadge } from "@/features/board/kanban-priority-badge";
import { formatKanbanCardDate } from "@/features/board/kanban-helpers";
import {
  cardTypeOption,
  formatKanbanDeadline,
  getDevKanbanPriority,
  getKanbanCardType,
  getKanbanDeadline,
  getKanbanSubtaskProgress,
  kanbanBoardSupportsProjects,
  type KanbanBoardConfig,
} from "@/lib/kanban-boards";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type KanbanCardProps = {
  entry: Entry;
  boardConfig: KanbanBoardConfig;
  isMoving?: boolean;
  onOpen: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
};

export function KanbanCard({ entry, boardConfig, isMoving, onOpen, onDragStart }: KanbanCardProps) {
  const priority = getDevKanbanPriority(entry);
  const deadline = getKanbanDeadline(entry);
  const subtasks = getKanbanSubtaskProgress(entry);
  const cardType = getKanbanCardType(entry, boardConfig);
  const project =
    kanbanBoardSupportsProjects(boardConfig.mode) ? cardTypeOption(boardConfig, cardType) : undefined;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      draggable
      tabIndex={0}
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        "kanban-card focus-ring cursor-grab rounded-lg border p-3 active:cursor-grabbing",
        isMoving && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-5 text-[var(--kanban-foreground)]">
          {entry.title}
        </h3>
        <KanbanPriorityBadge priority={priority} />
      </div>

      {entry.content ? (
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--kanban-muted)]">{entry.content}</p>
      ) : null}

      {project ? (
        <div className="mt-2.5">
          <span className={project.className}>{project.label}</span>
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--kanban-muted)]">
        {subtasks.total > 0 ? (
          <span className="inline-flex items-center gap-1">
            <CheckSquare className="size-3" aria-hidden="true" />
            {subtasks.done}/{subtasks.total}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3" aria-hidden="true" />
          {deadline ? formatKanbanDeadline(deadline) : formatKanbanCardDate(entry.updated_at)}
        </span>
      </div>
    </article>
  );
}
