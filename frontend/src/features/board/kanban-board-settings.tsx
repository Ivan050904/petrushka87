"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import {
  createColumnDefinition,
  definitionToConfig,
} from "@/lib/kanban-board-store";
import type { KanbanBoardDefinition } from "@/lib/kanban-boards";
import type { KanbanBoardConfig } from "@/lib/dev-kanban";
import type { Entry } from "@/lib/types";
import { getKanbanStage } from "@/lib/dev-kanban";
import { cn } from "@/lib/utils";

type KanbanBoardSettingsProps = {
  board: KanbanBoardConfig;
  entries: Entry[];
  onSave: (definition: KanbanBoardDefinition) => Promise<void>;
  onDeleteBoard?: () => Promise<void>;
  onClose: () => void;
};

function configToDefinition(board: KanbanBoardConfig): KanbanBoardDefinition {
  return {
    id: board.id,
    mode: board.mode === "custom" ? undefined : board.mode,
    label: board.label,
    subtitle: board.subtitle,
    emptyMessage: board.emptyMessage,
    defaultCardType: board.defaultCardType,
    cardTypes: board.cardTypes,
    isBuiltin: board.isBuiltin,
    configEntryId: board.configEntryId,
    columns: board.columns.map((column) => ({
      id: column.id,
      label: column.label,
      emptyHint: column.emptyHint,
      accent: column.accent,
      dotColor: column.dotColor,
    })),
  };
}

export function KanbanBoardSettings({
  board,
  entries,
  onSave,
  onDeleteBoard,
  onClose,
}: KanbanBoardSettingsProps) {
  const [draft, setDraft] = useState(() => configToDefinition(board));
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardsByStage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const stage = getKanbanStage(entry, board);
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return counts;
  }, [board, entries]);

  function updateColumn(index: number, label: string) {
    setDraft((current) => ({
      ...current,
      columns: current.columns.map((column, columnIndex) =>
        columnIndex === index ? { ...column, label } : column,
      ),
    }));
  }

  function moveColumn(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.columns.length) {
      return;
    }
    setDraft((current) => {
      const columns = [...current.columns];
      const [item] = columns.splice(index, 1);
      columns.splice(nextIndex, 0, item);
      return { ...current, columns };
    });
  }

  function removeColumn(index: number) {
    const column = draft.columns[index];
    if (!column) {
      return;
    }
    if ((cardsByStage.get(column.id) ?? 0) > 0) {
      setError(`В стадии «${column.label}» есть карточки. Сначала перемести или удали их.`);
      return;
    }
    if (draft.columns.length <= 1) {
      setError("На доске должна остаться хотя бы одна стадия.");
      return;
    }
    setError(null);
    setDraft((current) => ({
      ...current,
      columns: current.columns.filter((_, columnIndex) => columnIndex !== index),
    }));
  }

  function addColumn() {
    const label = newColumnLabel.trim();
    if (!label) {
      return;
    }
    setDraft((current) => ({
      ...current,
      columns: [
        ...current.columns,
        createColumnDefinition(
          label,
          current.columns.map((column) => column.id),
        ),
      ],
    }));
    setNewColumnLabel("");
    setError(null);
  }

  async function handleSave() {
    const trimmedColumns = draft.columns
      .map((column) => ({ ...column, label: column.label.trim() }))
      .filter((column) => column.label);
    if (trimmedColumns.length === 0) {
      setError("Добавь хотя бы одну стадию.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        ...draft,
        label: draft.label.trim() || board.label,
        columns: trimmedColumns,
      });
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось сохранить доску.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBoard() {
    if (!onDeleteBoard) {
      return;
    }
    if (!window.confirm(`Удалить доску «${board.label}»? Карточки на ней останутся в базе.`)) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onDeleteBoard();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить доску.");
    } finally {
      setIsSaving(false);
    }
  }

  const preview = definitionToConfig(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4">
      <div className="kanban-panel flex h-[100dvh] w-full max-w-2xl flex-col sm:h-auto sm:max-h-[90vh]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--kanban-border)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#1f2328]">
              <Settings2 className="size-4" aria-hidden="true" />
              Настройки доски
            </div>
            <p className="mt-1 text-sm text-[var(--kanban-muted)]">
              Переименуй стадии, измени порядок или добавь новые колонки.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-md p-2 text-[var(--kanban-muted)] transition hover:bg-[#f6f8fa] hover:text-[#1f2328]"
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <div className="mb-4">
              <Notice variant="error">{error}</Notice>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            {preview.columns.map((column, index) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--kanban-border)] bg-white p-3"
              >
                <span className={cn("size-2 shrink-0 rounded-full", column.dotColor)} aria-hidden="true" />
                <Input
                  value={column.label}
                  onChange={(event) => updateColumn(index, event.target.value)}
                  className="border-[var(--kanban-border)] bg-white"
                />
                <span className="shrink-0 text-xs text-[var(--kanban-muted)]">
                  {cardsByStage.get(column.id) ?? 0}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveColumn(index, -1)}
                    disabled={index === 0}
                    className="focus-ring rounded-md p-1.5 text-[var(--kanban-muted)] transition hover:bg-[#f6f8fa] disabled:opacity-40"
                    aria-label="Переместить влево"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, 1)}
                    disabled={index === preview.columns.length - 1}
                    className="focus-ring rounded-md p-1.5 text-[var(--kanban-muted)] transition hover:bg-[#f6f8fa] disabled:opacity-40"
                    aria-label="Переместить вправо"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeColumn(index)}
                    className="focus-ring rounded-md p-1.5 text-rose-600 transition hover:bg-rose-50"
                    aria-label="Удалить стадию"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Input
              value={newColumnLabel}
              onChange={(event) => setNewColumnLabel(event.target.value)}
              placeholder="Название новой стадии"
              className="border-[var(--kanban-border)] bg-white"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addColumn();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={addColumn} disabled={!newColumnLabel.trim()}>
              <Plus className="size-4" />
              Стадия
            </Button>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--kanban-border)] px-5 py-4">
          <div>
            {!board.isBuiltin && onDeleteBoard ? (
              <Button type="button" variant="ghost" onClick={() => void handleDeleteBoard()} disabled={isSaving}>
                Удалить доску
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? "Сохраняем..." : "Сохранить"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
