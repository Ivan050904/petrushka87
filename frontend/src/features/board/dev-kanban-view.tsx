"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CheckSquare, Kanban, LayoutGrid, Plus, Search } from "lucide-react";

import { KanbanCardDetail } from "@/features/board/kanban-card-detail";
import { KanbanEmptyState } from "@/features/board/kanban-empty-state";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import {
  appendKanbanHistory,
  createKanbanHistoryEvent,
  formatKanbanDeadline,
  getDevKanbanPriority,
  getDevKanbanStage,
  getKanbanBoardConfig,
  getKanbanDeadline,
  getKanbanHistory,
  getKanbanSubtaskProgress,
  isAnyKanbanEntry,
  isKanbanEntry,
  kanbanBoardList,
  kanbanMetadata,
  priorityAccent,
  type DevKanbanStage,
  type KanbanBoardMode,
} from "@/lib/dev-kanban";import { boardHref, parseKanbanBoardMode } from "@/lib/navigation";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

const DRAG_MIME = "application/x-folio-one-dev-kanban";

type DragPayload = {
  entryId: string;
  fromStage: DevKanbanStage;
};

function formatCardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function readDragPayload(event: DragEvent<HTMLElement>): DragPayload | null {
  const raw = event.dataTransfer.getData(DRAG_MIME);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export function DevKanbanView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardMode = parseKanbanBoardMode(searchParams.get("mode"));
  const boardConfig = getKanbanBoardConfig(boardMode);

  const { token } = useRequireAuth();
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragOverStage, setDragOverStage] = useState<DevKanbanStage | null>(null);
  const [movingEntryId, setMovingEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [addingStage, setAddingStage] = useState<DevKanbanStage | null>(null);  const [quickDraft, setQuickDraft] = useState("");

  const entries = useMemo(
    () => allEntries.filter((entry) => isKanbanEntry(entry, boardMode)),
    [allEntries, boardMode],
  );

  const loadEntries = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listEntries(token, { type: "note", limit: 100 });
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
    setAddingStage(null);
    setQuickDraft("");
    setSelectedEntry(null);
    setActionError(null);  }, [boardMode]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return entries;
    }
    return entries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(normalizedQuery) ||
        entry.content.toLowerCase().includes(normalizedQuery),
    );
  }, [entries, searchQuery]);

  const groupedEntries = useMemo(() => {
    const groups = Object.fromEntries(boardConfig.columns.map((column) => [column.id, [] as Entry[]])) as Record<
      DevKanbanStage,
      Entry[]
    >;
    for (const entry of filteredEntries) {
      groups[getDevKanbanStage(entry)].push(entry);
    }
    for (const stage of boardConfig.columns.map((column) => column.id)) {
      groups[stage].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      );
    }
    return groups;
  }, [boardConfig.columns, filteredEntries]);

  const hasActiveFilters = Boolean(searchQuery.trim());
  const showBoardEmpty = !isLoading && entries.length === 0 && !hasActiveFilters;
  const showNoResults = !isLoading && entries.length > 0 && filteredEntries.length === 0;
  const showColumns = !isLoading && entries.length > 0;

  function changeBoardMode(nextMode: KanbanBoardMode) {
    if (nextMode === boardMode) {
      return;
    }
    router.replace(boardHref(nextMode));
  }

  function openEntry(entry: Entry) {
    setSelectedEntry(entry);
    setActionError(null);
  }

  function closeDetail() {
    setSelectedEntry(null);
  }
  function startAdding(stage: DevKanbanStage = "inbox") {
    setAddingStage(stage);
    setQuickDraft("");
  }

  async function moveEntry(entry: Entry, nextStage: DevKanbanStage) {
    if (!token || getDevKanbanStage(entry) === nextStage) {
      return;
    }

    setMovingEntryId(entry.id);
    setActionError(null);
    const nextMetadata = {
      ...entry.metadata,
      ...kanbanMetadata(boardMode, nextStage),
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

  async function createCard(stage: DevKanbanStage, content: string, title?: string) {
    if (!token) {
      return;
    }

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      return;
    }

    setActionError(null);
    try {
      const created = await createEntry(token, {
        type: "note",
        title: title?.trim() || normalizedContent.split("\n")[0].slice(0, 120),
        content: normalizedContent,
        metadata: kanbanMetadata(boardMode, stage),
      });
      setAllEntries((current) => [created, ...current]);
      setQuickDraft("");
      setAddingStage(null);
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
  function handleDragStart(event: DragEvent<HTMLElement>, entry: Entry) {
    const payload: DragPayload = {
      entryId: entry.id,
      fromStage: getDevKanbanStage(entry),
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
  }

  function handleDrop(event: DragEvent<HTMLElement>, stage: DevKanbanStage) {
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

  return (
    <div className="kanban-surface flex min-h-0 flex-1 flex-col">
      <header className="kanban-panel shrink-0 border-b px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--kanban-border)] bg-white text-[var(--kanban-muted)]">
                <Kanban className="size-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--kanban-muted)]">
                  <LayoutGrid className="size-3.5" aria-hidden="true" />
                  Канбан
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-[#1f2328]">{boardConfig.label}</h1>
                <p className="mt-0.5 text-sm text-[var(--kanban-muted)]">{boardConfig.subtitle}</p>
                <p className="mt-1 text-sm text-[var(--kanban-muted)]">
                  {entries.length}{" "}
                  {entries.length === 1 ? "карточка" : entries.length < 5 ? "карточки" : "карточек"} на доске
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--kanban-muted)]" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Поиск карточек..."
                  className="border-[var(--kanban-border)] bg-white pl-9"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Режим канбана">
            {kanbanBoardList.map((board) => (
              <button
                key={board.mode}
                type="button"
                role="tab"
                aria-selected={boardMode === board.mode}
                onClick={() => changeBoardMode(board.mode)}
                className={cn(
                  "focus-ring rounded-md border px-3 py-1.5 text-sm font-medium transition",
                  boardMode === board.mode ? "kanban-filter-active" : "kanban-filter-inactive",
                )}
              >
                {board.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="px-4 py-4 lg:px-6">
          <Notice variant="error">{loadError}</Notice>
        </div>
      ) : null}

      {actionError ? (
        <div className="px-4 py-2 lg:px-6">
          <Notice variant="error">{actionError}</Notice>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-[var(--kanban-muted)]">
          Загружаем канбан...
        </div>
      ) : showBoardEmpty ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <KanbanEmptyState message={boardConfig.emptyMessage} onAdd={() => startAdding("inbox")} />
        </div>
      ) : showNoResults ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <p className="text-sm text-[var(--kanban-muted)]">Ничего не найдено. Попробуй другой поиск.</p>
        </div>
      ) : showColumns ? (
        <div className="flex-1 overflow-x-auto px-4 py-4 lg:px-6">
          <div className="flex min-h-full gap-3 pb-4">
            {boardConfig.columns.map((column) => {
              const columnEntries = groupedEntries[column.id];
              const isDropTarget = dragOverStage === column.id;

              return (
                <section
                  key={column.id}
                  className={cn(
                    "kanban-panel flex w-[min(100%,18.5rem)] shrink-0 flex-col rounded-xl border shadow-sm",
                    column.accent,
                    "border-t-[3px]",
                    isDropTarget && "ring-2 ring-[var(--kanban-accent)]/35",
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverStage(column.id);
                  }}
                  onDragLeave={() => setDragOverStage((current) => (current === column.id ? null : current))}
                  onDrop={(event) => handleDrop(event, column.id)}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--kanban-border)] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn("size-2 shrink-0 rounded-full", column.dotColor)} aria-hidden="true" />
                      <h2 className="truncate text-sm font-semibold text-[#1f2328]">{column.label}</h2>
                      <span className="rounded-full border border-[var(--kanban-border)] bg-[#f6f8fa] px-2 py-0.5 text-xs font-medium text-[var(--kanban-muted)]">
                        {columnEntries.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-h-[14rem] flex-1 flex-col gap-2 p-2">
                    {columnEntries.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[var(--kanban-border)] px-3 py-8 text-center text-sm text-[var(--kanban-muted)]">
                        {column.emptyHint}
                      </div>
                    ) : (
                      columnEntries.map((entry) => {
                        const isMoving = movingEntryId === entry.id;
                        const priority = getDevKanbanPriority(entry);
                        const deadline = getKanbanDeadline(entry);
                        const subtasks = getKanbanSubtaskProgress(entry);

                        return (
                          <article
                            key={entry.id}
                            draggable
                            onDragStart={(event) => handleDragStart(event, entry)}
                            onClick={() => openEntry(entry)}
                            className={cn(
                              "kanban-panel cursor-grab rounded-lg border p-3 shadow-sm transition hover:border-[var(--kanban-accent)]/40 hover:shadow-md active:cursor-grabbing",
                              isMoving && "opacity-50",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={cn("kanban-card-priority mt-1.5 shrink-0", priorityAccent(priority))}
                                title={`Приоритет ${priority}`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0 flex-1">
                                <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-[#1f2328]">
                                  {entry.title}
                                </h3>
                                {entry.content ? (
                                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--kanban-muted)]">
                                    {entry.content}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--kanban-muted)]">
                              {deadline ? (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="size-3" aria-hidden="true" />
                                  {formatKanbanDeadline(deadline)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="size-3" aria-hidden="true" />
                                  {formatCardDate(entry.updated_at)}
                                </span>
                              )}
                              {subtasks.total > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  <CheckSquare className="size-3" aria-hidden="true" />
                                  {subtasks.done}/{subtasks.total}
                                </span>
                              ) : null}
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>

                  {addingStage === column.id ? (
                    <div className="border-t border-[var(--kanban-border)] p-2">
                      <Textarea
                        value={quickDraft}
                        onChange={(event) => setQuickDraft(event.target.value)}
                        placeholder={boardConfig.mode === "psych" ? "О чём мысль..." : "Новая карточка..."}
                        rows={3}
                        className="border-[var(--kanban-border)] bg-white text-sm"
                        autoFocus
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void createCard(column.id, quickDraft)}
                          disabled={!quickDraft.trim()}
                        >
                          Добавить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAddingStage(null);
                            setQuickDraft("");
                          }}
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startAdding(column.id)}
                      className="focus-ring flex items-center gap-2 rounded-b-xl border-t border-[var(--kanban-border)] px-3 py-2.5 text-sm text-[var(--kanban-muted)] transition hover:bg-[#f6f8fa] hover:text-[#1f2328]"
                    >
                      <Plus className="size-4" />
                      Добавить карточку
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {showBoardEmpty && addingStage === "inbox" ? (
        <div className="kanban-panel border-t px-4 py-4 lg:px-6">
          <div className="mx-auto max-w-xl rounded-xl border border-[var(--kanban-border)] bg-white p-4 shadow-sm">
            <FieldGroup>
              <Field>
                <FieldLabel>Новая карточка</FieldLabel>
                <Textarea
                  value={quickDraft}
                  onChange={(event) => setQuickDraft(event.target.value)}
                  rows={4}
                  placeholder={boardConfig.mode === "psych" ? "О чём мысль..." : "Новая карточка..."}
                  className="border-[var(--kanban-border)] bg-white"
                  autoFocus
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  onClick={() => void createCard("inbox", quickDraft)}
                  disabled={!quickDraft.trim()}
                >
                  Добавить на доску
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAddingStage(null);
                    setQuickDraft("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </FieldGroup>
          </div>
        </div>
      ) : null}

      {selectedEntry ? (
        <KanbanCardDetail
          entry={selectedEntry}
          boardMode={boardMode}
          onClose={closeDetail}
          onUpdate={(updated) => {
            setAllEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            setSelectedEntry(updated);
          }}
          onDelete={() => void removeSelected()}
        />
      ) : null}
    </div>
  );
}
