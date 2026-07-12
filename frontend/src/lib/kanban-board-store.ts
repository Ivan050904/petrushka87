import type { KanbanBoardDefinition, KanbanColumnDefinition } from "@/lib/kanban-boards";
import { getDefaultKanbanBoards } from "@/lib/kanban-boards";
import {
  createKanbanId,
  kanbanBoards,
  type DevKanbanColumn,
  type KanbanBoardConfig,
  type KanbanCardTypeOption,
} from "@/lib/kanban-boards";
import { createEntry, deleteEntry, fetchAllEntries, updateEntry } from "@/lib/api";

export const KANBAN_BOARD_CONFIG_COLLECTION = "kanban_board_config";

const COLUMN_ACCENTS = [
  { accent: "border-t-orange-400", dotColor: "bg-orange-400" },
  { accent: "border-t-sky-500", dotColor: "bg-sky-500" },
  { accent: "border-t-amber-500", dotColor: "bg-amber-500" },
  { accent: "border-t-rose-500", dotColor: "bg-rose-500" },
  { accent: "border-t-indigo-500", dotColor: "bg-indigo-500" },
  { accent: "border-t-cyan-500", dotColor: "bg-cyan-500" },
  { accent: "border-t-fuchsia-500", dotColor: "bg-fuchsia-500" },
] as const;

const PROJECT_TAG_CLASSES: Record<string, string> = {
  "bg-orange-400": "kanban-card-tag bg-orange-500/15 text-orange-300 border-orange-500/30",
  "bg-sky-500": "kanban-card-tag bg-sky-500/15 text-sky-300 border-sky-500/30",
  "bg-amber-500": "kanban-card-tag bg-amber-500/15 text-amber-200 border-amber-500/30",
  "bg-rose-500": "kanban-card-tag bg-rose-500/15 text-rose-300 border-rose-500/30",
  "bg-indigo-500": "kanban-card-tag bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  "bg-cyan-500": "kanban-card-tag bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "bg-fuchsia-500": "kanban-card-tag bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

export function slugifyKanbanColumnId(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return normalized || `stage_${Date.now()}`;
}

export function decorateKanbanColumn(
  column: KanbanColumnDefinition,
  index: number,
): DevKanbanColumn {
  const palette = COLUMN_ACCENTS[index % COLUMN_ACCENTS.length];
  return {
    id: column.id,
    label: column.label,
    emptyHint: column.emptyHint || "Перетащи сюда карточку",
    accent: column.accent || palette.accent,
    dotColor: column.dotColor || palette.dotColor,
  };
}

export function definitionToConfig(definition: KanbanBoardDefinition): KanbanBoardConfig {
  const builtin =
    definition.mode && definition.mode !== "custom" ? kanbanBoards[definition.mode] : null;
  const isCodeBoard = definition.mode === "code" || definition.id === kanbanBoards.code.id;
  const cardTypes = isCodeBoard ? (definition.cardTypes ?? []) : [];
  const defaultCardType =
    isCodeBoard && cardTypes.length > 0
      ? (definition.defaultCardType && cardTypes.some((item) => item.value === definition.defaultCardType)
          ? definition.defaultCardType
          : cardTypes[0].value)
      : "";
  return {
    id: definition.id,
    mode: definition.mode ?? "custom",
    label: definition.label,
    subtitle: definition.subtitle,
    emptyMessage: definition.emptyMessage || builtin?.emptyMessage || "Доска пуста. Добавь первую карточку.",
    defaultCardType,
    cardTypes,
    columns: definition.columns.map((column, index) => decorateKanbanColumn(column, index)),
    isBuiltin: definition.isBuiltin,
    configEntryId: definition.configEntryId,
  };
}

export function configToDefinition(board: KanbanBoardConfig): KanbanBoardDefinition {
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

function readCardTypes(value: unknown): KanbanCardTypeOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const cardTypes: KanbanCardTypeOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const optionValue = typeof record.value === "string" ? record.value.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const className = typeof record.className === "string" ? record.className : "";
    if (!optionValue || !label || !className) {
      continue;
    }
    cardTypes.push({
      value: optionValue,
      label,
      className,
      dotColor: typeof record.dotColor === "string" ? record.dotColor : undefined,
    });
  }
  return cardTypes;
}

function readColumns(value: unknown): KanbanColumnDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const columns: KanbanColumnDefinition[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!id || !label) {
      continue;
    }
    columns.push({
      id,
      label,
      emptyHint: typeof record.emptyHint === "string" ? record.emptyHint : undefined,
      accent: typeof record.accent === "string" ? record.accent : undefined,
      dotColor: typeof record.dotColor === "string" ? record.dotColor : undefined,
    });
  }
  return columns;
}

function entryToDefinition(entry: { id: string; title: string; metadata: Record<string, unknown> }): KanbanBoardDefinition | null {
  if (entry.metadata.collection !== KANBAN_BOARD_CONFIG_COLLECTION) {
    return null;
  }
  const boardId = typeof entry.metadata.board_id === "string" ? entry.metadata.board_id : "";
  if (!boardId) {
    return null;
  }
  const columns = readColumns(entry.metadata.columns);
  if (columns.length === 0) {
    return null;
  }

  const mode =
    entry.metadata.board_mode === "code" ||
    entry.metadata.board_mode === "tasks" ||
    entry.metadata.board_mode === "psych"
      ? entry.metadata.board_mode
      : undefined;

  return {
    id: boardId,
    mode,
    label: typeof entry.metadata.label === "string" ? entry.metadata.label : entry.title,
    subtitle: typeof entry.metadata.subtitle === "string" ? entry.metadata.subtitle : "",
    emptyMessage: typeof entry.metadata.empty_message === "string" ? entry.metadata.empty_message : undefined,
    defaultCardType:
      typeof entry.metadata.default_card_type === "string" ? entry.metadata.default_card_type : undefined,
    cardTypes: readCardTypes(entry.metadata.card_types),
    isBuiltin: Boolean(entry.metadata.is_builtin),
    configEntryId: entry.id,
    columns,
  };
}

function definitionToMetadata(definition: KanbanBoardDefinition) {
  return {
    collection: KANBAN_BOARD_CONFIG_COLLECTION,
    board_id: definition.id,
    board_mode: definition.mode,
    label: definition.label,
    subtitle: definition.subtitle,
    empty_message: definition.emptyMessage,
    default_card_type: definition.defaultCardType,
    card_types: definition.cardTypes ?? [],
    is_builtin: definition.isBuiltin,
    columns: definition.columns,
  };
}

export async function loadKanbanBoardDefinitions(token: string): Promise<KanbanBoardDefinition[]> {
  const result = await fetchAllEntries(token, {
    type: "note",
    collection: KANBAN_BOARD_CONFIG_COLLECTION,
  });

  const saved = result.items
    .map((entry) => entryToDefinition(entry))
    .filter((item): item is KanbanBoardDefinition => item !== null);

  const defaults = getDefaultKanbanBoards();
  const savedById = new Map(saved.map((board) => [board.id, board]));

  return defaults.map((defaultBoard) => {
    const override = savedById.get(defaultBoard.id);
    if (override) {
      return {
        ...defaultBoard,
        ...override,
        mode: defaultBoard.mode,
        isBuiltin: true,
        configEntryId: override.configEntryId,
      };
    }
    return defaultBoard;
  }).concat(saved.filter((board) => !board.isBuiltin && !defaults.some((item) => item.id === board.id)));
}

export async function saveKanbanBoardDefinition(token: string, definition: KanbanBoardDefinition) {
  const payload = {
    type: "note" as const,
    title: definition.label,
    content: definition.subtitle || definition.label,
    metadata: definitionToMetadata(definition),
  };

  if (definition.configEntryId) {
    return updateEntry(token, definition.configEntryId, payload);
  }

  return createEntry(token, payload);
}

export async function deleteKanbanBoardDefinition(token: string, configEntryId: string) {
  await deleteEntry(token, configEntryId);
}

export function createEmptyBoardDefinition(name: string): KanbanBoardDefinition {
  const trimmed = name.trim() || "Новая доска";
  return {
    id: `kanban_custom_${createKanbanId().slice(0, 8)}`,
    label: trimmed,
    subtitle: "Пользовательская доска",
    emptyMessage: "Доска пуста. Добавь первую карточку.",
    isBuiltin: false,
    columns: [
      { id: "inbox", label: "Неразобранное", emptyHint: "Новые карточки" },
      { id: "in_progress", label: "В работе", emptyHint: "То, что делаешь сейчас" },
      { id: "done", label: "Готово", emptyHint: "Закрытые карточки" },
    ],
  };
}

export function createKanbanProject(name: string, existingProjects: KanbanCardTypeOption[]): KanbanCardTypeOption {
  const trimmed = name.trim() || "Проект";
  const baseId = slugifyKanbanColumnId(trimmed);
  const existingIds = new Set(existingProjects.map((item) => item.value));
  let value = baseId;
  let suffix = 2;
  while (existingIds.has(value)) {
    value = `${baseId}_${suffix}`;
    suffix += 1;
  }
  const palette = COLUMN_ACCENTS[existingProjects.length % COLUMN_ACCENTS.length];
  return {
    value,
    label: trimmed,
    dotColor: palette.dotColor,
    className: PROJECT_TAG_CLASSES[palette.dotColor] ?? "kanban-card-tag bg-slate-500/15 text-slate-300 border-slate-500/30",
  };
}

export function createColumnDefinition(label: string, existingIds: string[]): KanbanColumnDefinition {
  const baseId = slugifyKanbanColumnId(label);
  let id = baseId;
  let suffix = 2;
  while (existingIds.includes(id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  return {
    id,
    label: label.trim() || "Новая стадия",
    emptyHint: "Перетащи сюда карточку",
  };
}

export const PETR_CODE_BOARD_COLUMNS: KanbanColumnDefinition[] = [
  { id: "future", label: "На будущее", emptyHint: "Идеи и задачи, которые пока отложены", accent: "border-t-orange-400", dotColor: "bg-orange-400" },
  { id: "inbox", label: "Неразобранное", emptyHint: "Новые идеи, баги и задачи по коду" },
  { id: "analysis", label: "На анализе", emptyHint: "То, что нужно осмыслить и разобрать" },
  { id: "in_progress", label: "В разработке", emptyHint: "То, что пишешь в коде прямо сейчас" },
  { id: "done", label: "Готово", emptyHint: "Реализовано и принято" },
];
