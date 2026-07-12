"use client";

import Link from "next/link";
import { Bell, LayoutGrid, Plus, Search, Settings2 } from "lucide-react";

import { KanbanFilterBar } from "@/features/board/kanban-filter-bar";
import { KanbanProjectPills } from "@/features/board/kanban-project-pills";
import { kanbanUserInitials } from "@/features/board/kanban-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KanbanBoardConfig } from "@/lib/kanban-boards";
import { kanbanBoardSupportsProjects, kanbanProjects } from "@/lib/kanban-boards";
import { ROUTES } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type KanbanToolbarProps = {
  boardConfig: KanbanBoardConfig;
  boards: KanbanBoardConfig[];
  boardId: string;
  entryCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  priorityFilter: number | null;
  onPriorityChange: (value: number | null) => void;
  projectFilter: string | null;
  onProjectChange: (value: string | null) => void;
  overdueOnly: boolean;
  onOverdueChange: (value: boolean) => void;
  unreadNotificationCount: number;
  displayName: string;
  userEmail?: string | null;
  onCreateTask: () => void;
  onOpenSettings: () => void;
  onChangeBoard: (board: KanbanBoardConfig) => void;
  isCreatingBoard: boolean;
  newBoardName: string;
  onNewBoardNameChange: (value: string) => void;
  onStartCreateBoard: () => void;
  onSubmitCreateBoard: () => void;
  onCancelCreateBoard: () => void;
  isCreatingProject: boolean;
  newProjectName: string;
  onNewProjectNameChange: (value: string) => void;
  onStartCreateProject: () => void;
  onSubmitCreateProject: () => void;
  onCancelCreateProject: () => void;
};

export function KanbanToolbar({
  boardConfig,
  boards,
  boardId,
  entryCount,
  searchQuery,
  onSearchChange,
  priorityFilter,
  onPriorityChange,
  projectFilter,
  onProjectChange,
  overdueOnly,
  onOverdueChange,
  unreadNotificationCount,
  displayName,
  userEmail,
  onCreateTask,
  onOpenSettings,
  onChangeBoard,
  isCreatingBoard,
  newBoardName,
  onNewBoardNameChange,
  onStartCreateBoard,
  onSubmitCreateBoard,
  onCancelCreateBoard,
  isCreatingProject,
  newProjectName,
  onNewProjectNameChange,
  onStartCreateProject,
  onSubmitCreateProject,
  onCancelCreateProject,
}: KanbanToolbarProps) {
  const initials = kanbanUserInitials(displayName, userEmail);
  const supportsProjects = kanbanBoardSupportsProjects(boardConfig.mode);
  const projects = kanbanProjects(boardConfig);
  const entryLabel = entryCount === 1 ? "задача" : entryCount < 5 ? "задачи" : "задач";

  const filtersAndBoards = (
    <>
      <KanbanFilterBar
        priorityFilter={priorityFilter}
        onPriorityChange={onPriorityChange}
        overdueOnly={overdueOnly}
        onOverdueChange={onOverdueChange}
      />

      {supportsProjects ? (
        <div className="flex flex-wrap items-center gap-2">
          {projects.length >= 1 ? (
            <KanbanProjectPills projects={projects} activeProject={projectFilter} onChange={onProjectChange} />
          ) : null}
          {isCreatingProject ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newProjectName}
                onChange={(event) => onNewProjectNameChange(event.target.value)}
                placeholder="Название проекта"
                className="kanban-toolbar-input h-9 w-full min-w-0 text-sm sm:w-44"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSubmitCreateProject();
                  }
                  if (event.key === "Escape") {
                    onCancelCreateProject();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={onSubmitCreateProject} disabled={!newProjectName.trim()}>
                Создать
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onCancelCreateProject}>
                Отмена
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartCreateProject}
              className="focus-ring kanban-filter-inactive inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition"
            >
              <Plus className="size-4" />
              Проект
            </button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Доски канбана">
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            role="tab"
            aria-selected={boardId === board.id}
            onClick={() => onChangeBoard(board)}
            className={cn(
              "focus-ring min-h-10 rounded-md border px-3 py-1.5 text-sm font-medium transition",
              boardId === board.id ? "kanban-filter-active" : "kanban-filter-inactive",
            )}
          >
            {board.label}
          </button>
        ))}
        {isCreatingBoard ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newBoardName}
              onChange={(event) => onNewBoardNameChange(event.target.value)}
              placeholder="Название доски"
              className="kanban-toolbar-input h-9 w-full min-w-0 text-sm sm:w-44"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmitCreateBoard();
                }
                if (event.key === "Escape") {
                  onCancelCreateBoard();
                }
              }}
            />
            <Button type="button" size="sm" onClick={onSubmitCreateBoard} disabled={!newBoardName.trim()}>
              Создать
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancelCreateBoard}>
              Отмена
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartCreateBoard}
            className="focus-ring kanban-filter-inactive inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition"
          >
            <Plus className="size-4" />
            Доска
          </button>
        )}
      </div>
    </>
  );

  return (
    <header className="shrink-0 border-b border-[var(--kanban-border)] bg-[var(--kanban-bg)] px-3 py-2 lg:px-6 lg:py-4">
      <div className="flex flex-col gap-2 lg:gap-4">
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--kanban-foreground)]">{boardConfig.label}</p>
            <p className="text-xs text-[var(--kanban-muted)]">
              {entryCount} {entryLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Настройки доски">
              <Settings2 className="size-4" />
            </Button>
            <Button type="button" size="icon" onClick={onCreateTask} aria-label="Создать задачу">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="hidden flex-col gap-4 xl:flex-row xl:items-center xl:justify-between lg:flex">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-[var(--kanban-muted)]">
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              Канбан
            </div>
            <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--kanban-foreground)]">
              {boardConfig.label}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--kanban-muted)]">
              {entryCount} {entryLabel}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="kanban-search" className="relative w-full min-w-0 flex-1 sm:min-w-[220px] sm:max-w-md">
              <span className="sr-only">Поиск задач</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--kanban-muted)]" />
              <Input
                id="kanban-search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Поиск..."
                className="kanban-toolbar-input pl-9"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative text-[var(--kanban-muted)] hover:bg-[var(--kanban-panel)] hover:text-[var(--kanban-foreground)]"
                aria-label="Уведомления"
                asChild
              >
                <Link href={ROUTES.dashboard}>
                  <Bell className="size-4" />
                  {unreadNotificationCount > 0 ? (
                    <Badge className="absolute -right-1 -top-1 min-w-5 bg-rose-500 px-1 text-[10px] text-white">
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </Badge>
                  ) : null}
                </Link>
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Настройки доски">
                <Settings2 className="size-4" />
              </Button>
              <Button type="button" onClick={onCreateTask} className="gap-2">
                <Plus className="size-4" />
                Создать задачу
              </Button>
              <div className="hidden items-center gap-2 rounded-md border border-[var(--kanban-border)] bg-[var(--kanban-panel)] px-2 py-1.5 sm:flex">
                <span className="flex size-8 items-center justify-center rounded-full bg-[var(--kanban-accent)]/20 text-xs font-semibold text-[var(--kanban-foreground)]">
                  {initials}
                </span>
                <span className="max-w-[8rem] truncate text-sm text-[var(--kanban-foreground)]">{displayName}</span>
              </div>
            </div>
          </div>
        </div>

        <label htmlFor="kanban-search-mobile" className="relative w-full lg:hidden">
          <span className="sr-only">Поиск задач</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--kanban-muted)]" />
          <Input
            id="kanban-search-mobile"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск..."
            className="kanban-toolbar-input pl-9"
          />
        </label>

        <details className="group lg:hidden">
          <summary className="focus-ring cursor-pointer list-none rounded-md py-2 text-sm font-medium text-[var(--kanban-foreground)] marker:content-none">
            Фильтры и доски
          </summary>
          <div className="flex max-h-[min(40vh,280px)] flex-col gap-3 overflow-y-auto pb-1 pt-1">{filtersAndBoards}</div>
        </details>

        <div className="hidden flex-col gap-3 lg:flex">{filtersAndBoards}</div>
      </div>
    </header>
  );
}
