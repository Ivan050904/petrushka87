"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { KanbanBoardSettings } from "@/features/board/kanban-board-settings";
import { KanbanCardDetail } from "@/features/board/kanban-card-detail";
import { KanbanColumn } from "@/features/board/kanban-column";
import { KanbanEmptyState } from "@/features/board/kanban-empty-state";
import { KanbanProjectPicker } from "@/features/board/kanban-project-picker";
import { KanbanToolbar } from "@/features/board/kanban-toolbar";
import { isKanbanOverdue } from "@/features/board/kanban-helpers";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { LoadError } from "@/components/load-error";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, useRequireAuth } from "@/hooks/use-auth";
import { useKanbanBoards } from "@/hooks/use-kanban-boards";
import { createEntry, deleteEntry, fetchAllEntries, getErrorMessage, updateEntry } from "@/lib/api";
import { configToDefinition, createKanbanProject, KANBAN_BOARD_CONFIG_COLLECTION } from "@/lib/kanban-board-store";
import {
  appendKanbanHistory,
  createKanbanHistoryEvent,
  getDevKanbanPriority,
  getKanbanCardType,
  getKanbanHistory,
  getKanbanStage,
  isAnyKanbanEntry,
  isKanbanEntry,
  kanbanBoardSupportsProjects,
  kanbanMetadata,
  kanbanProjects,
  resolveBoardIdFromQuery,
  type KanbanBoardConfig,
  type KanbanStage,
} from "@/lib/kanban-boards";
import { boardHref } from "@/lib/navigation";
import type { Entry } from "@/lib/types";

const DRAG_MIME = "application/x-folio-one-kanban";
const LEGACY_DRAG_MIME = "application/x-folio-one-dev-kanban";

type DragPayload = {
  entryId: string;
  fromStage: KanbanStage;
};

function readDragPayload(event: DragEvent<HTMLElement>): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData(LEGACY_DRAG_MIME);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

function resolveCreateCardType(
  boardConfig: KanbanBoardConfig,
  projectFilter: string | null,
  createCardProject: string | null,
): string | undefined {
  const projects = kanbanProjects(boardConfig);
  if (projects.length === 0) {
    return undefined;
  }
  if (projects.length === 1) {
    return projects[0].value;
  }
  const chosen = createCardProject ?? projectFilter ?? projects[0].value;
  return projects.some((project) => project.value === chosen) ? chosen : projects[0].value;
}

export function KanbanView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useRequireAuth();
  const { user } = useAuth();
  const { boards, isLoading: boardsLoading, error: boardsError, saveBoard, createBoard, deleteBoard } =
    useKanbanBoards(token);

  const boardId = useMemo(() => {
    if (boards.length === 0) {
      return resolveBoardIdFromQuery([], {
        board: searchParams.get("board"),
        mode: searchParams.get("mode"),
      });
    }
    const resolved = resolveBoardIdFromQuery(boards, {
      board: searchParams.get("board"),
      mode: searchParams.get("mode"),
    });
    return boards.some((board) => board.id === resolved) ? resolved : boards[0].id;
  }, [boards, searchParams]);

  const boardConfig = useMemo(
    () => boards.find((board) => board.id === boardId) ?? boards[0] ?? null,
    [boardId, boards],
  );

  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<number | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<KanbanStage | null>(null);
  const [movingEntryId, setMovingEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [addingStage, setAddingStage] = useState<KanbanStage | null>(null);
  const [quickDraft, setQuickDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [createCardProject, setCreateCardProject] = useState<string | null>(null);

  const entries = useMemo(
    () => (boardConfig ? allEntries.filter((entry) => isKanbanEntry(entry, boardConfig.id)) : []),
    [allEntries, boardConfig],
  );

  const loadEntries = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await fetchAllEntries(token, {
        type: "note",
        exclude_collection: KANBAN_BOARD_CONFIG_COLLECTION,
      });
      setAllEntries(result.items.filter(isAnyKanbanEntry));
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить канбан."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    setSearchQuery("");
    setPriorityFilter(null);
    setProjectFilter(null);
    setOverdueOnly(false);
    setAddingStage(null);
    setQuickDraft("");
    setSelectedEntry(null);
    setActionError(null);
    setShowSettings(false);
    setIsCreatingProject(false);
    setNewProjectName("");
    setCreateCardProject(null);
  }, [boardId]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (normalizedQuery) {
        const matchesQuery =
          entry.title.toLowerCase().includes(normalizedQuery) ||
          entry.content.toLowerCase().includes(normalizedQuery);
        if (!matchesQuery) {
          return false;
        }
      }
      if (priorityFilter !== null && getDevKanbanPriority(entry) !== priorityFilter) {
        return false;
      }
      if (
        projectFilter &&
        boardConfig &&
        kanbanBoardSupportsProjects(boardConfig.mode) &&
        getKanbanCardType(entry, boardConfig) !== projectFilter
      ) {
        return false;
      }
      if (overdueOnly && !isKanbanOverdue(entry)) {
        return false;
      }
      return true;
    });
  }, [entries, searchQuery, priorityFilter, projectFilter, overdueOnly, boardConfig]);

  const groupedEntries = useMemo(() => {
    if (!boardConfig) {
      return {} as Record<KanbanStage, Entry[]>;
    }
    const groups = Object.fromEntries(boardConfig.columns.map((column) => [column.id, [] as Entry[]])) as Record<
      KanbanStage,
      Entry[]
    >;
    for (const entry of filteredEntries) {
      const stage = getKanbanStage(entry, boardConfig);
      if (!groups[stage]) {
        groups[stage] = [];
      }
      groups[stage].push(entry);
    }
    for (const stage of boardConfig.columns.map((column) => column.id)) {
      groups[stage]?.sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      );
    }
    return groups;
  }, [boardConfig, filteredEntries]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || priorityFilter !== null || projectFilter || overdueOnly,
  );
  const showBoardEmpty = !isLoading && !boardsLoading && entries.length === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && entries.length > 0 && filteredEntries.length === 0;
  const showColumns = !isLoading && !boardsLoading && boardConfig && entries.length > 0;
  const defaultStage = boardConfig?.columns[0]?.id ?? "new";

  function changeBoard(nextBoard: KanbanBoardConfig) {
    if (nextBoard.id === boardId) {
      return;
    }
    router.replace(boardHref({ boardId: nextBoard.id, mode: nextBoard.mode === "custom" ? undefined : nextBoard.mode }));
  }

  function openEntry(entry: Entry) {
    setSelectedEntry(entry);
    setActionError(null);
  }

  function closeDetail() {
    setSelectedEntry(null);
  }

  function startAdding(stage: KanbanStage = defaultStage) {
    setAddingStage(stage);
    setQuickDraft("");
    if (boardConfig && kanbanBoardSupportsProjects(boardConfig.mode)) {
      const projects = kanbanProjects(boardConfig);
      setCreateCardProject(projectFilter ?? projects[0]?.value ?? null);
    } else {
      setCreateCardProject(null);
    }
  }

  async function moveEntry(entry: Entry, nextStage: KanbanStage) {
    if (!token || !boardConfig || getKanbanStage(entry, boardConfig) === nextStage) {
      return;
    }

    setMovingEntryId(entry.id);
    setActionError(null);
    const nextMetadata = {
      ...entry.metadata,
      ...kanbanMetadata(boardConfig.id, nextStage, boardConfig),
      history: appendKanbanHistory(
        getKanbanHistory(entry),
        createKanbanHistoryEvent(
          "moved",
          `Перемещено в «${boardConfig.columns.find((column) => column.id === nextStage)?.label ?? nextStage}»`,
        ),
      ),
    };

    try {
      const updated = await updateEntry(token, entry.id, { metadata: nextMetadata });
      setAllEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedEntry?.id === updated.id) {
        setSelectedEntry(updated);
      }
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось переместить карточку."));
    } finally {
      setMovingEntryId(null);
      setDragOverStage(null);
    }
  }

  async function createCard(stage: KanbanStage, content: string, title?: string) {
    if (!token || !boardConfig) {
      return;
    }

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return;
    }

    setActionError(null);
    try {
      const cardType = resolveCreateCardType(boardConfig, projectFilter, createCardProject);
      const created = await createEntry(token, {
        type: "note",
        title: title?.trim() || normalizedContent.split("\n")[0].slice(0, 120),
        content: normalizedContent,
        metadata: kanbanMetadata(boardConfig.id, stage, boardConfig, {
          cardType,
        }),
      });
      setAllEntries((current) => [created, ...current]);
      setQuickDraft("");
      setAddingStage(null);
      setCreateCardProject(null);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось добавить карточку."));
    }
  }

  async function removeSelected() {
    if (!token || !selectedEntry) {
      return;
    }

    setActionError(null);
    try {
      await deleteEntry(token, selectedEntry.id);
      setAllEntries((current) => current.filter((item) => item.id !== selectedEntry.id));
      closeDetail();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось удалить карточку."));
    }
  }

  async function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name || !boardConfig || !kanbanBoardSupportsProjects(boardConfig.mode)) {
      return;
    }
    setActionError(null);
    try {
      const nextProject = createKanbanProject(name, boardConfig.cardTypes);
      const nextCardTypes = [...boardConfig.cardTypes, nextProject];
      await saveBoard(
        configToDefinition({
          ...boardConfig,
          cardTypes: nextCardTypes,
          defaultCardType: boardConfig.defaultCardType || nextProject.value,
        }),
      );
      setNewProjectName("");
      setIsCreatingProject(false);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось создать проект."));
    }
  }

  async function handleCreateBoard() {
    const name = newBoardName.trim();
    if (!name) {
      return;
    }
    setActionError(null);
    try {
      const created = await createBoard(name);
      setNewBoardName("");
      setIsCreatingBoard(false);
      if (created) {
        router.replace(boardHref({ boardId: created.id }));
      }
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось создать доску."));
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, entry: Entry) {
    if (!boardConfig) {
      return;
    }
    const payload: DragPayload = {
      entryId: entry.id,
      fromStage: getKanbanStage(entry, boardConfig),
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  }

  function handleDrop(event: DragEvent<HTMLElement>, stage: KanbanStage) {
    event.preventDefault();
    const payload = readDragPayload(event);
    if (!payload) {
      return;
    }
    const entry = entries.find((item) => item.id === payload.entryId);
    if (!entry) {
      return;
    }
    void moveEntry(entry, stage);
  }

  if (!boardConfig && !boardsLoading) {
    return (
      <div className="kanban-surface flex flex-1 items-center justify-center px-6 py-16 text-sm text-[var(--kanban-muted)]">
        Не удалось загрузить доски канбана.
      </div>
    );
  }

  const addPlaceholder = boardConfig?.mode === "psych" ? "О чём мысль..." : "Новая задача...";
  const createProjects = boardConfig ? kanbanProjects(boardConfig) : [];
  const showCreateProjectPicker = Boolean(boardConfig && createProjects.length > 1);

  return (
    <div className="kanban-surface flex min-h-0 flex-1 flex-col">
      {boardConfig ? (
        <KanbanToolbar
          boardConfig={boardConfig}
          boards={boards}
          boardId={boardId}
          entryCount={entries.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          projectFilter={projectFilter}
          onProjectChange={setProjectFilter}
          overdueOnly={overdueOnly}
          onOverdueChange={setOverdueOnly}
          unreadNotificationCount={0}
          displayName={user?.full_name || user?.email || "Пользователь"}
          userEmail={user?.email}
          onCreateTask={() => startAdding(defaultStage)}
          onOpenSettings={() => setShowSettings(true)}
          onChangeBoard={changeBoard}
          isCreatingBoard={isCreatingBoard}
          newBoardName={newBoardName}
          onNewBoardNameChange={setNewBoardName}
          onStartCreateBoard={() => setIsCreatingBoard(true)}
          onSubmitCreateBoard={() => void handleCreateBoard()}
          onCancelCreateBoard={() => {
            setIsCreatingBoard(false);
            setNewBoardName("");
          }}
          isCreatingProject={isCreatingProject}
          newProjectName={newProjectName}
          onNewProjectNameChange={setNewProjectName}
          onStartCreateProject={() => setIsCreatingProject(true)}
          onSubmitCreateProject={() => void handleCreateProject()}
          onCancelCreateProject={() => {
            setIsCreatingProject(false);
            setNewProjectName("");
          }}
        />
      ) : null}

      {boardsError ? (
        <div className="px-4 py-2 lg:px-6">
          <Notice variant="error">{boardsError}</Notice>
        </div>
      ) : null}

      {loadError ? (
        <div className="px-4 py-4 lg:px-6">
          <LoadError message={loadError} onRetry={() => void loadEntries()} />
        </div>
      ) : null}

      {actionError ? (
        <div className="px-4 py-2 lg:px-6">
          <Notice variant="error">{actionError}</Notice>
        </div>
      ) : null}

      {boardsLoading ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-[var(--kanban-muted)]">
          Загружаем канбан...
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-[var(--kanban-muted)]">
          Загружаем задачи...
        </div>
      ) : showBoardEmpty ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <KanbanEmptyState message={boardConfig?.emptyMessage ?? "Доска пуста."} onAdd={() => startAdding(defaultStage)} />
        </div>
      ) : showNoResults ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <p className="text-sm text-[var(--kanban-muted)]">Ничего не найдено. Попробуй другой фильтр.</p>
        </div>
      ) : showColumns && boardConfig ? (
        <div className="kanban-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2 py-2 lg:px-6 lg:py-4">
          <p className="mb-3 text-xs text-[var(--kanban-muted)] lg:hidden">Листайте колонки влево и вправо →</p>
          <div className="flex h-full min-h-0 gap-3 pb-4">
            {boardConfig.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                boardConfig={boardConfig}
                entries={groupedEntries[column.id] ?? []}
                isDropTarget={dragOverStage === column.id}
                movingEntryId={movingEntryId}
                isAdding={addingStage === column.id}
                quickDraft={quickDraft}
                addPlaceholder={addPlaceholder}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStage(column.id);
                }}
                onDragLeave={() => setDragOverStage((current) => (current === column.id ? null : current))}
                onDrop={(event) => handleDrop(event, column.id)}
                onOpenEntry={openEntry}
                onDragStart={handleDragStart}
                onStartAdding={() => startAdding(column.id)}
                onQuickDraftChange={setQuickDraft}
                onSubmitQuickAdd={() => void createCard(column.id, quickDraft)}
                onCancelQuickAdd={() => {
                  setAddingStage(null);
                  setQuickDraft("");
                  setCreateCardProject(null);
                }}
                createProjects={createProjects}
                showCreateProjectPicker={showCreateProjectPicker}
                createCardProject={createCardProject ?? createProjects[0]?.value ?? ""}
                onCreateCardProjectChange={setCreateCardProject}
              />
            ))}
          </div>
        </div>
      ) : null}

      {showBoardEmpty && addingStage === defaultStage ? (
        <div className="border-t border-[var(--kanban-border)] px-4 py-4 lg:px-6">
          <div className="mx-auto max-w-xl rounded-xl border border-[var(--kanban-border)] bg-[var(--kanban-panel)] p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="kanban-board-empty-add">Новая задача</FieldLabel>
                {showCreateProjectPicker ? (
                  <KanbanProjectPicker
                    id="kanban-board-empty-project"
                    projects={createProjects}
                    value={createCardProject ?? createProjects[0]?.value ?? ""}
                    onChange={setCreateCardProject}
                  />
                ) : null}
                <Textarea
                  id="kanban-board-empty-add"
                  value={quickDraft}
                  onChange={(event) => setQuickDraft(event.target.value)}
                  rows={4}
                  placeholder={addPlaceholder}
                  className="kanban-toolbar-input"
                  autoFocus
                />
              </Field>
              <div className="flex gap-2">
                <Button onClick={() => void createCard(defaultStage, quickDraft)} disabled={!quickDraft.trim()}>
                  Добавить на доску
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAddingStage(null);
                    setQuickDraft("");
                    setCreateCardProject(null);
                  }}
                >
                  Отмена
                </Button>
              </div>
            </FieldGroup>
          </div>
        </div>
      ) : null}

      {selectedEntry && boardConfig ? (
        <KanbanCardDetail
          entry={selectedEntry}
          boardConfig={boardConfig}
          onClose={closeDetail}
          onUpdate={(updated) => {
            setAllEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            setSelectedEntry(updated);
          }}
          onDelete={() => void removeSelected()}
          onMoveStage={(nextStage) => moveEntry(selectedEntry, nextStage)}
        />
      ) : null}

      {showSettings && boardConfig ? (
        <KanbanBoardSettings
          board={boardConfig}
          entries={entries}
          onSave={async (definition) => {
            await saveBoard(definition);
          }}
          onDeleteBoard={
            boardConfig.configEntryId && !boardConfig.isBuiltin
              ? async () => {
                  await deleteBoard(boardConfig.configEntryId!);
                  router.replace(boardHref());
                }
              : undefined
          }
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </div>
  );
}
