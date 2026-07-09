"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import {
  CalendarDays,
  GripVertical,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import { formatDate } from "@/lib/entry-helpers";
import {
  getThoughtPriority,
  getThoughtStage,
  isThoughtBoardEntry,
  priorityAccent,
  priorityLabel,
  thoughtBoardMetadata,
  thoughtColumns,
  type ThoughtStage,
} from "@/lib/thought-board";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type DragPayload = {
  entryId: string;
  fromStage: ThoughtStage;
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
  const raw = event.dataTransfer.getData("application/x-letscore-thought");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}

export function ThoughtBoardView() {
  const { token } = useRequireAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ThoughtStage | null>(null);
  const [movingEntryId, setMovingEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftPriority, setDraftPriority] = useState(3);
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [addingStage, setAddingStage] = useState<ThoughtStage | null>(null);
  const [quickDraft, setQuickDraft] = useState("");

  const loadEntries = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listEntries(token, { type: "note", limit: 200 });
      setEntries(result.items.filter(isThoughtBoardEntry));
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить доску мыслей."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      const priority = getThoughtPriority(entry);
      if (priorityFilter !== null && priority !== priorityFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        entry.title.toLowerCase().includes(normalizedQuery) ||
        entry.content.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [entries, priorityFilter, searchQuery]);

  const groupedEntries = useMemo(() => {
    const groups = Object.fromEntries(thoughtColumns.map((column) => [column.id, [] as Entry[]])) as Record<
      ThoughtStage,
      Entry[]
    >;
    for (const entry of filteredEntries) {
      groups[getThoughtStage(entry)].push(entry);
    }
    for (const stage of thoughtColumns.map((column) => column.id)) {
      groups[stage].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      );
    }
    return groups;
  }, [filteredEntries]);

  function openEntry(entry: Entry) {
    setSelectedEntry(entry);
    setDraftTitle(entry.title);
    setDraftContent(entry.content);
    setDraftPriority(getThoughtPriority(entry));
    setActionError(null);
  }

  function closeDetail() {
    setSelectedEntry(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftPriority(3);
  }

  async function moveEntry(entry: Entry, nextStage: ThoughtStage) {
    if (!token || getThoughtStage(entry) === nextStage) {
      return;
    }

    setMovingEntryId(entry.id);
    setActionError(null);
    const nextMetadata = {
      ...entry.metadata,
      ...thoughtBoardMetadata(nextStage, getThoughtPriority(entry)),
    };

    try {
      const updated = await updateEntry(token, entry.id, { metadata: nextMetadata });
      setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedEntry?.id === updated.id) {
        setSelectedEntry(updated);
      }
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось переместить мысль."));
    } finally {
      setMovingEntryId(null);
      setDragOverStage(null);
    }
  }

  async function createThought(stage: ThoughtStage, content: string, title?: string) {
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
        metadata: thoughtBoardMetadata(stage, 3),
      });
      setEntries((current) => [created, ...current]);
      setQuickDraft("");
      setAddingStage(null);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось добавить мысль."));
    }
  }

  async function saveDetail() {
    if (!token || !selectedEntry) {
      return;
    }

    setIsSavingDetail(true);
    setActionError(null);
    try {
      const updated = await updateEntry(token, selectedEntry.id, {
        title: draftTitle.trim() || selectedEntry.title,
        content: draftContent.trim(),
        metadata: {
          ...selectedEntry.metadata,
          ...thoughtBoardMetadata(getThoughtStage(selectedEntry), draftPriority),
        },
      });
      setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedEntry(updated);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось сохранить мысль."));
    } finally {
      setIsSavingDetail(false);
    }
  }

  async function removeSelected() {
    if (!token || !selectedEntry) {
      return;
    }

    setIsSavingDetail(true);
    setActionError(null);
    try {
      await deleteEntry(token, selectedEntry.id);
      setEntries((current) => current.filter((item) => item.id !== selectedEntry.id));
      closeDetail();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось удалить мысль."));
    } finally {
      setIsSavingDetail(false);
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, entry: Entry) {
    const payload: DragPayload = {
      entryId: entry.id,
      fromStage: getThoughtStage(entry),
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-letscore-thought", JSON.stringify(payload));
  }

  function handleDrop(event: DragEvent<HTMLElement>, stage: ThoughtStage) {
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
    <div className="flex min-h-[calc(100dvh-var(--shell-desktop-header))] flex-col bg-[#111318] text-zinc-100">
      <header className="border-b border-white/10 px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Sparkles className="size-4 text-sky-400" />
              Личная доска
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">Доска мыслей</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск мыслей..."
                className="border-white/10 bg-[#1a1d24] pl-9 text-zinc-100 placeholder:text-zinc-500"
              />
            </label>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 text-xs uppercase tracking-wide text-zinc-500">Приоритет</span>
              {[1, 2, 3, 4, 5].map((priority) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() => setPriorityFilter((current) => (current === priority ? null : priority))}
                  className={cn(
                    "focus-ring min-h-8 min-w-8 rounded-md border text-sm font-medium transition",
                    priorityFilter === priority
                      ? "border-sky-400/60 bg-sky-400/15 text-sky-200"
                      : "border-white/10 bg-[#1a1d24] text-zinc-300 hover:border-white/20",
                  )}
                >
                  {priority}
                </button>
              ))}
            </div>
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
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-sm text-zinc-400">
          Загружаем доску...
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <Empty
            title="Доска пока пуста. Добавь первую сырую мысль — всё, что крутится в голове и не хочется забыть."
            actionLabel="Добавить мысль"
            onAction={() => setAddingStage("raw")}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto px-4 py-4 lg:px-6">
          <div className="flex min-h-full gap-4 pb-4">
            {thoughtColumns.map((column) => {
              const columnEntries = groupedEntries[column.id];
              const isDropTarget = dragOverStage === column.id;

              return (
                <section
                  key={column.id}
                  className={cn(
                    "flex w-[min(100%,20rem)] shrink-0 flex-col rounded-xl border border-white/10 bg-[#171a21]",
                    column.accent,
                    "border-t-4",
                    isDropTarget && "ring-2 ring-sky-400/40",
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverStage(column.id);
                  }}
                  onDragLeave={() => setDragOverStage((current) => (current === column.id ? null : current))}
                  onDrop={(event) => handleDrop(event, column.id)}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-4 text-zinc-600" />
                      <h2 className="text-sm font-semibold text-white">{column.label}</h2>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-300">
                        {columnEntries.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-h-[12rem] flex-1 flex-col gap-3 p-3">
                    {columnEntries.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-sm text-zinc-500">
                        {column.emptyHint}
                      </div>
                    ) : (
                      columnEntries.map((entry) => {
                        const priority = getThoughtPriority(entry);
                        const isMoving = movingEntryId === entry.id;

                        return (
                          <article
                            key={entry.id}
                            draggable
                            onDragStart={(event) => handleDragStart(event, entry)}
                            onClick={() => openEntry(entry)}
                            className={cn(
                              "group cursor-grab rounded-lg border border-white/10 bg-[#1f232b] p-3 shadow-sm transition hover:border-white/20 active:cursor-grabbing",
                              isMoving && "opacity-50",
                            )}
                          >
                            <div className="flex gap-3">
                              <div className={cn("mt-0.5 w-1 shrink-0 rounded-full", priorityAccent(priority))} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="line-clamp-2 text-sm font-medium text-white">{entry.title}</h3>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">
                                    <span className={cn("size-2 rounded-full", priorityAccent(priority))} />
                                    {priorityLabel(priority)}
                                  </span>
                                </div>
                                {entry.content ? (
                                  <p className="mt-2 line-clamp-3 text-sm leading-5 text-zinc-400">{entry.content}</p>
                                ) : null}
                                <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                                  <CalendarDays className="size-3.5" />
                                  <span>{formatCardDate(entry.updated_at)}</span>
                                </div>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>

                  {addingStage === column.id ? (
                    <div className="border-t border-white/10 p-3">
                      <Textarea
                        value={quickDraft}
                        onChange={(event) => setQuickDraft(event.target.value)}
                        placeholder="Новая мысль..."
                        rows={3}
                        className="border-white/10 bg-[#111318] text-zinc-100"
                        autoFocus
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void createThought(column.id, quickDraft)}
                          disabled={!quickDraft.trim()}
                        >
                          Добавить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-zinc-300 hover:bg-white/5 hover:text-white"
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
                      onClick={() => {
                        setAddingStage(column.id);
                        setQuickDraft("");
                      }}
                      className="focus-ring flex items-center gap-2 border-t border-white/10 px-3 py-3 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
                    >
                      <Plus className="size-4" />
                      Добавить мысль
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {entries.length === 0 && addingStage === "raw" ? (
        <div className="border-t border-white/10 px-4 py-4 lg:px-6">
          <div className="mx-auto max-w-xl rounded-xl border border-white/10 bg-[#171a21] p-4">
            <FieldGroup>
              <Field>
                <FieldLabel className="text-zinc-300">Первая сырая мысль</FieldLabel>
                <Textarea
                  value={quickDraft}
                  onChange={(event) => setQuickDraft(event.target.value)}
                  rows={4}
                  placeholder="Например: хочу импортировать заметки с телефона в LetsCore"
                  className="border-white/10 bg-[#111318] text-zinc-100"
                  autoFocus
                />
              </Field>
              <div className="flex gap-2">
                <Button onClick={() => void createThought("raw", quickDraft)} disabled={!quickDraft.trim()}>
                  Добавить на доску
                </Button>
                <Button
                  variant="ghost"
                  className="text-zinc-300 hover:bg-white/5 hover:text-white"
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#171a21] p-5 text-zinc-100 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {thoughtColumns.find((column) => column.id === getThoughtStage(selectedEntry))?.label}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-white">Редактирование мысли</h2>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="focus-ring rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
                aria-label="Закрыть"
              >
                <X className="size-5" />
              </button>
            </div>

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel className="text-zinc-300">Заголовок</FieldLabel>
                <Input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  className="border-white/10 bg-[#111318] text-zinc-100"
                />
              </Field>
              <Field>
                <FieldLabel className="text-zinc-300">Содержание</FieldLabel>
                <Textarea
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.target.value)}
                  rows={6}
                  className="border-white/10 bg-[#111318] text-zinc-100"
                />
              </Field>
              <Field>
                <FieldLabel className="text-zinc-300">Приоритет</FieldLabel>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => setDraftPriority(priority)}
                      className={cn(
                        "focus-ring min-h-9 min-w-9 rounded-md border text-sm font-medium",
                        draftPriority === priority
                          ? "border-sky-400/60 bg-sky-400/15 text-sky-200"
                          : "border-white/10 bg-[#111318] text-zinc-300",
                      )}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </Field>
              <p className="text-xs text-zinc-500">Обновлено: {formatDate(selectedEntry.updated_at)}</p>
            </FieldGroup>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => void saveDetail()} disabled={isSavingDetail}>
                Сохранить
              </Button>
              <Button
                variant="ghost"
                className="text-zinc-300 hover:bg-white/5 hover:text-white"
                onClick={closeDetail}
              >
                Закрыть
              </Button>
              <Button
                variant="ghost"
                className="ml-auto text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                onClick={() => void removeSelected()}
                disabled={isSavingDetail}
              >
                <Trash2 className="mr-2 size-4" />
                Удалить
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
