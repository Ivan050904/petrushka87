"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  Flag,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { useRequireAuth } from "@/hooks/use-auth";
import {
  downloadResourceFile,
  getErrorMessage,
  listEntries,
  updateEntry,
  uploadResource,
} from "@/lib/api";
import {
  appendKanbanHistory,
  createKanbanHistoryEvent,
  createKanbanId,
  formatKanbanDeadline,
  getDevKanbanPriority,
  getKanbanAttachmentIds,
  getKanbanComments,
  getKanbanDeadline,
  getKanbanHistory,
  getKanbanStage,
  getKanbanSubtaskProgress,
  getKanbanSubtasks,
  KANBAN_MAX_ATTACHMENTS,
  KANBAN_MAX_FILE_BYTES,
  kanbanMetadata,
  priorityAccent,
  toDateInputValue,
  type KanbanBoardConfig,
  type KanbanComment,
  type KanbanHistoryEvent,
  type KanbanSubtask,
} from "@/lib/dev-kanban";
import { formatDate } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type DetailTab = "details" | "discussion" | "history";

type KanbanCardDraft = {
  title: string;
  content: string;
  priority: number;
  deadline: string;
  subtasks: KanbanSubtask[];
  attachmentIds: string[];
  comments: KanbanComment[];
  history: KanbanHistoryEvent[];
};

type KanbanCardDetailProps = {
  entry: Entry;
  boardConfig: KanbanBoardConfig;
  onClose: () => void;
  onUpdate: (entry: Entry) => void;
  onDelete: () => void;
};

function entryToDraft(entry: Entry): KanbanCardDraft {
  return {
    title: entry.title,
    content: entry.content,
    priority: getDevKanbanPriority(entry),
    deadline: toDateInputValue(getKanbanDeadline(entry)),
    subtasks: getKanbanSubtasks(entry),
    attachmentIds: getKanbanAttachmentIds(entry),
    comments: getKanbanComments(entry),
    history: getKanbanHistory(entry),
  };
}

function draftsEqual(left: KanbanCardDraft, right: KanbanCardDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildHistoryEvents(previous: Entry, draft: KanbanCardDraft): KanbanHistoryEvent[] {
  const events: KanbanHistoryEvent[] = [];
  if (previous.title !== draft.title.trim()) {
    events.push(createKanbanHistoryEvent("updated", "Изменён заголовок"));
  }
  if (previous.content !== draft.content.trim()) {
    events.push(createKanbanHistoryEvent("updated", "Изменено описание"));
  }
  if (getDevKanbanPriority(previous) !== draft.priority) {
    events.push(createKanbanHistoryEvent("updated", `Приоритет: ${draft.priority}`));
  }
  if (toDateInputValue(getKanbanDeadline(previous)) !== draft.deadline) {
    events.push(
      createKanbanHistoryEvent(
        "updated",
        draft.deadline ? `Срок: ${formatKanbanDeadline(draft.deadline)}` : "Срок удалён",
      ),
    );
  }
  const previousSubtasks = getKanbanSubtasks(previous);
  if (JSON.stringify(previousSubtasks) !== JSON.stringify(draft.subtasks)) {
    events.push(createKanbanHistoryEvent("subtask", "Обновлены подзадачи"));
  }
  const previousAttachments = getKanbanAttachmentIds(previous);
  if (JSON.stringify(previousAttachments) !== JSON.stringify(draft.attachmentIds)) {
    events.push(createKanbanHistoryEvent("attachment", "Обновлены документы"));
  }
  return events;
}

function SectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="kanban-detail-section-label">
      <span className="kanban-detail-section-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function KanbanCardDetail({ entry, boardConfig, onClose, onUpdate, onDelete }: KanbanCardDetailProps) {
  const { token } = useRequireAuth();
  const stage = getKanbanStage(entry, boardConfig);
  const stageLabel = boardConfig.columns.find((column) => column.id === stage)?.label ?? stage;

  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const [draft, setDraft] = useState<KanbanCardDraft>(() => entryToDraft(entry));
  const [resourceTitles, setResourceTitles] = useState<Record<string, string>>({});
  const [newSubtask, setNewSubtask] = useState("");
  const [newComment, setNewComment] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const entryRef = useRef(entry);
  const draftRef = useRef(draft);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  entryRef.current = entry;
  draftRef.current = draft;

  const subtaskProgress = useMemo(() => getKanbanSubtaskProgress({ ...entry, metadata: { ...entry.metadata, subtasks: draft.subtasks } }), [draft.subtasks, entry]);

  const loadResourceTitles = useCallback(async () => {
    if (!token || draft.attachmentIds.length === 0) {
      return;
    }
    try {
      const result = await listEntries(token, { type: "resource", limit: 100 });
      const titles = Object.fromEntries(
        result.items
          .filter((item) => draft.attachmentIds.includes(item.id))
          .map((item) => [item.id, item.title]),
      );
      setResourceTitles(titles);
    } catch {
      // Non-blocking: titles can stay as ids.
    }
  }, [draft.attachmentIds, token]);

  useEffect(() => {
    void loadResourceTitles();
  }, [loadResourceTitles]);

  useEffect(() => {
    setDraft(entryToDraft(entry));
    setSaveError(null);
  }, [entry.id]);

  const persistDraft = useCallback(async () => {
    if (!token) {
      return;
    }

    const currentEntry = entryRef.current;
    const currentDraft = draftRef.current;
    const baseline = entryToDraft(currentEntry);
    if (draftsEqual(baseline, currentDraft)) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const historyEvents = buildHistoryEvents(currentEntry, currentDraft);
    const nextHistory = historyEvents.reduce(
      (history, event) => appendKanbanHistory(history, event),
      currentDraft.history,
    );

    try {
      const updated = await updateEntry(token, currentEntry.id, {
        title: currentDraft.title.trim() || currentEntry.title,
        content: currentDraft.content.trim(),
        metadata: {
          ...currentEntry.metadata,
          ...kanbanMetadata(boardConfig.id, getKanbanStage(currentEntry, boardConfig), boardConfig, {
            priority: currentDraft.priority,
          }),
          deadline: currentDraft.deadline || null,
          subtasks: currentDraft.subtasks,
          attachment_ids: currentDraft.attachmentIds,
          comments: currentDraft.comments,
          history: nextHistory,
        },
      });
      setDraft(entryToDraft(updated));
      setLastSavedAt(new Date().toISOString());
      onUpdate(updated);
    } catch (requestError) {
      setSaveError(getErrorMessage(requestError, "Не удалось сохранить карточку."));
    } finally {
      setIsSaving(false);
    }
  }, [boardConfig, onUpdate, token]);

  useEffect(() => {
    const baseline = entryToDraft(entry);
    if (draftsEqual(baseline, draft)) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void persistDraft();
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [draft, entry, persistDraft]);

  function updateDraft(patch: Partial<KanbanCardDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function addSubtask() {
    const title = newSubtask.trim();
    if (!title) {
      return;
    }
    updateDraft({
      subtasks: [...draft.subtasks, { id: createKanbanId(), title, done: false }],
    });
    setNewSubtask("");
  }

  function toggleSubtask(id: string) {
    updateDraft({
      subtasks: draft.subtasks.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    });
  }

  function removeSubtask(id: string) {
    updateDraft({
      subtasks: draft.subtasks.filter((item) => item.id !== id),
    });
  }

  function addComment() {
    const text = newComment.trim();
    if (!text) {
      return;
    }
    const comment: KanbanComment = {
      id: createKanbanId(),
      text,
      created_at: new Date().toISOString(),
    };
    const history = appendKanbanHistory(
      draft.history,
      createKanbanHistoryEvent("comment", "Добавлен комментарий"),
    );
    updateDraft({
      comments: [...draft.comments, comment],
      history,
    });
    setNewComment("");
    setActiveTab("discussion");
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!token || !files || files.length === 0) {
      return;
    }

    const remainingSlots = KANBAN_MAX_ATTACHMENTS - draft.attachmentIds.length;
    if (remainingSlots <= 0) {
      setSaveError(`Максимум ${KANBAN_MAX_ATTACHMENTS} файлов.`);
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    const tooLarge = selected.find((file) => file.size > KANBAN_MAX_FILE_BYTES);
    if (tooLarge) {
      setSaveError(`Файл «${tooLarge.name}» больше 15 МБ.`);
      return;
    }

    setIsUploading(true);
    setSaveError(null);
    const nextIds = [...draft.attachmentIds];
    const nextTitles = { ...resourceTitles };

    try {
      for (const file of selected) {
        const uploaded = await uploadResource(token, {
          title: file.name,
          description: `Вложение к карточке «${draft.title || entry.title}»`,
          file,
        });
        nextIds.push(uploaded.id);
        nextTitles[uploaded.id] = uploaded.title;
      }
      setResourceTitles(nextTitles);
      updateDraft({ attachmentIds: nextIds });
    } catch (requestError) {
      setSaveError(getErrorMessage(requestError, "Не удалось загрузить файл."));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removeAttachment(id: string) {
    updateDraft({
      attachmentIds: draft.attachmentIds.filter((item) => item !== id),
    });
  }

  async function downloadAttachment(id: string) {
    if (!token) {
      return;
    }
    try {
      const blob = await downloadResourceFile(token, id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = resourceTitles[id] ?? "file";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setSaveError(getErrorMessage(requestError, "Не удалось скачать файл."));
    }
  }

  const historyItems = useMemo(() => {
    const seed: KanbanHistoryEvent[] = draft.history.length
      ? draft.history
      : [
          {
            id: "created",
            action: "created",
            label: "Карточка создана",
            created_at: entry.created_at,
          },
        ];
    return [...seed].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );
  }, [draft.history, entry.created_at]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
      <div className="kanban-detail-shell flex h-[100dvh] w-full max-w-xl flex-col sm:h-auto sm:max-h-[90vh]">
        <header className="kanban-detail-header shrink-0 px-5 pb-0 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--kanban-detail-muted)]">в {stageLabel}</p>
              <input
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
                className="kanban-detail-title-input mt-1 w-full bg-transparent text-xl font-semibold outline-none"
                placeholder="Название карточки"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDelete}
                className="kanban-detail-icon-btn"
                aria-label="Удалить карточку"
              >
                <Trash2 className="size-4" />
              </button>
              <button type="button" onClick={onClose} className="kanban-detail-icon-btn" aria-label="Закрыть">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-5 border-b border-[var(--kanban-detail-border)]" role="tablist">
            {(
              [
                ["details", "Детали"],
                ["discussion", "Обсуждение"],
                ["history", "История"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "kanban-detail-tab pb-3 text-sm font-medium transition",
                  activeTab === tab ? "kanban-detail-tab-active" : "kanban-detail-tab-inactive",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="kanban-detail-body min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {activeTab === "details" ? (
            <div className="flex flex-col gap-6">
              <section>
                <SectionLabel icon={<AlignLeft className="size-3.5" />}>Описание</SectionLabel>
                <textarea
                  value={draft.content}
                  onChange={(event) => updateDraft({ content: event.target.value })}
                  rows={5}
                  placeholder="Добавьте описание..."
                  className="kanban-detail-textarea mt-2"
                />
              </section>

              <section>
                <SectionLabel icon={<Paperclip className="size-3.5" />}>Документы</SectionLabel>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleFilesSelected(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || draft.attachmentIds.length >= KANBAN_MAX_ATTACHMENTS}
                  className="kanban-detail-upload mt-2"
                >
                  <Upload className="size-4" />
                  <span>{isUploading ? "Загрузка..." : "Прикрепить с компьютера"}</span>
                </button>
                <p className="mt-2 text-xs text-[var(--kanban-detail-muted)]">
                  До 15 МБ на файл, максимум {KANBAN_MAX_ATTACHMENTS} файлов
                </p>
                {draft.attachmentIds.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {draft.attachmentIds.map((id) => (
                      <li key={id} className="kanban-detail-attachment">
                        <button
                          type="button"
                          onClick={() => void downloadAttachment(id)}
                          className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                        >
                          {resourceTitles[id] ?? "Файл"}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAttachment(id)}
                          className="kanban-detail-icon-btn shrink-0"
                          aria-label="Удалить файл"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section>
                <SectionLabel icon={<Flag className="size-3.5" />}>Приоритет</SectionLabel>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateDraft({ priority: value })}
                      className={cn(
                        "kanban-detail-priority-btn",
                        draft.priority === value && "kanban-detail-priority-btn-active",
                        draft.priority === value && value >= 4 && priorityAccent(value),
                      )}
                      aria-label={`Приоритет ${value}`}
                      aria-pressed={draft.priority === value}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <SectionLabel icon={<CalendarDays className="size-3.5" />}>Срок</SectionLabel>
                <div className="relative mt-2">
                  <input
                    type="date"
                    value={draft.deadline}
                    onChange={(event) => updateDraft({ deadline: event.target.value })}
                    className="kanban-detail-date"
                  />
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel icon={<CheckSquare className="size-3.5" />}>Подзадачи</SectionLabel>
                  <span className="text-xs text-[var(--kanban-detail-muted)]">
                    {subtaskProgress.done}/{subtaskProgress.total}
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {draft.subtasks.map((subtask) => (
                    <li key={subtask.id} className="kanban-detail-subtask">
                      <button
                        type="button"
                        onClick={() => toggleSubtask(subtask.id)}
                        className={cn("kanban-detail-checkbox", subtask.done && "kanban-detail-checkbox-checked")}
                        aria-label={subtask.done ? "Отметить невыполненной" : "Отметить выполненной"}
                        aria-pressed={subtask.done}
                      >
                        {subtask.done ? <CheckSquare className="size-3.5" /> : null}
                      </button>
                      <span className={cn("min-w-0 flex-1 text-sm", subtask.done && "line-through opacity-60")}>
                        {subtask.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSubtask(subtask.id)}
                        className="kanban-detail-icon-btn shrink-0"
                        aria-label="Удалить подзадачу"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="kanban-detail-subtask-add mt-2">
                  <input
                    value={newSubtask}
                    onChange={(event) => setNewSubtask(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addSubtask();
                      }
                    }}
                    placeholder="Новая подзадача..."
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={addSubtask}
                    disabled={!newSubtask.trim()}
                    className="kanban-detail-icon-btn"
                    aria-label="Добавить подзадачу"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "discussion" ? (
            <div className="flex flex-col gap-4">
              {draft.comments.length === 0 ? (
                <p className="text-sm text-[var(--kanban-detail-muted)]">Комментариев пока нет.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {draft.comments.map((comment) => (
                    <li key={comment.id} className="kanban-detail-comment">
                      <div className="mb-1 flex items-center gap-2 text-xs text-[var(--kanban-detail-muted)]">
                        <MessageSquare className="size-3.5" />
                        <span>{formatDate(comment.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">{comment.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="kanban-detail-comment-compose">
                <textarea
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  rows={3}
                  placeholder="Написать комментарий..."
                  className="kanban-detail-textarea border-0 bg-transparent p-0"
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={!newComment.trim()}
                  className="kanban-detail-send-btn"
                >
                  Отправить
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === "history" ? (
            <ul className="flex flex-col gap-3">
              {historyItems.map((item) => (
                <li key={item.id} className="kanban-detail-history-item">
                  <p className="text-sm">{item.label}</p>
                  <p className="mt-1 text-xs text-[var(--kanban-detail-muted)]">{formatDate(item.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {saveError ? <p className="mt-4 text-sm text-rose-400">{saveError}</p> : null}
        </div>

        <footer className="kanban-detail-footer shrink-0 px-5 py-3 text-center text-xs text-[var(--kanban-detail-muted)]">
          {isSaving ? "Сохранение..." : lastSavedAt ? "Изменения сохраняются автоматически" : "Изменения сохраняются автоматически"}
        </footer>
      </div>
    </div>
  );
}
