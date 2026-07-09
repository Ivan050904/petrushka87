import type { Entry } from "@/lib/types";
import { getNumber, getString } from "@/lib/entry-helpers";

export const kanbanBoardModes = ["code", "tasks", "psych"] as const;
export type KanbanBoardMode = (typeof kanbanBoardModes)[number];

/** @deprecated use kanban board ids via getKanbanBoardConfig */
export const DEV_KANBAN_BOARD_ID = "kanban_code" as const;

export const devKanbanStages = ["inbox", "analysis", "in_progress", "done"] as const;
export type DevKanbanStage = (typeof devKanbanStages)[number];

export type KanbanCardTypeOption = {
  value: string;
  label: string;
  className: string;
};

export type DevKanbanColumn = {
  id: DevKanbanStage;
  label: string;
  accent: string;
  dotColor: string;
  emptyHint: string;
};

export type KanbanBoardConfig = {
  id: string;
  mode: KanbanBoardMode;
  label: string;
  subtitle: string;
  emptyMessage: string;
  defaultCardType: string;
  cardTypes: KanbanCardTypeOption[];
  columns: DevKanbanColumn[];
};

const LEGACY_STAGE_MAP: Record<string, DevKanbanStage> = {
  raw: "inbox",
  decision: "analysis",
  doing: "in_progress",
  done: "done",
};

const SHARED_COLUMNS: DevKanbanColumn[] = [
  {
    id: "inbox",
    label: "Неразобранное",
    accent: "border-t-slate-400",
    dotColor: "bg-slate-400",
    emptyHint: "Новые записи без статуса",
  },
  {
    id: "analysis",
    label: "На анализе",
    accent: "border-t-violet-500",
    dotColor: "bg-violet-500",
    emptyHint: "То, что нужно осмыслить и разобрать",
  },
  {
    id: "in_progress",
    label: "В работе",
    accent: "border-t-blue-500",
    dotColor: "bg-blue-500",
    emptyHint: "То, над чем работаешь прямо сейчас",
  },
  {
    id: "done",
    label: "Готово",
    accent: "border-t-emerald-500",
    dotColor: "bg-emerald-500",
    emptyHint: "Закрытые и принятые записи",
  },
];

export const kanbanBoards: Record<KanbanBoardMode, KanbanBoardConfig> = {
  code: {
    id: "kanban_code",
    mode: "code",
    label: "Код",
    subtitle: "Разработка и технические задачи",
    emptyMessage: "Доска пуста. Добавь первую карточку.",
    defaultCardType: "card",
    cardTypes: [{ value: "card", label: "Карточка", className: "bg-slate-100 text-slate-800 border-slate-200" }],
    columns: SHARED_COLUMNS.map((column) =>
      column.id === "inbox"
        ? { ...column, emptyHint: "Новые идеи, баги и задачи по коду" }
        : column.id === "in_progress"
          ? { ...column, label: "В разработке", emptyHint: "То, что пишешь в коде прямо сейчас" }
          : column.id === "done"
            ? { ...column, emptyHint: "Реализовано и принято" }
            : column,
    ),
  },
  tasks: {
    id: "kanban_tasks",
    mode: "tasks",
    label: "Задачи",
    subtitle: "Личные и рабочие дела",
    emptyMessage: "Доска пуста. Добавь первую карточку.",
    defaultCardType: "card",
    cardTypes: [{ value: "card", label: "Карточка", className: "bg-slate-100 text-slate-800 border-slate-200" }],
    columns: SHARED_COLUMNS.map((column) =>
      column.id === "inbox"
        ? { ...column, emptyHint: "Задачи, которые ещё не разобрал" }
        : column.id === "analysis"
          ? { ...column, emptyHint: "Нужно уточнить план и следующий шаг" }
          : column,
    ),
  },
  psych: {
    id: "kanban_psych",
    mode: "psych",
    label: "Психология",
    subtitle: "От сырой мысли до проработанного вывода",
    emptyMessage: "Доска пуста. Сбрось первую мысль через / или добавь карточку вручную.",
    defaultCardType: "card",
    cardTypes: [{ value: "card", label: "Карточка", className: "bg-violet-100 text-violet-800 border-violet-200" }],
    columns: [
      {
        id: "inbox",
        label: "Неразобранное",
        accent: "border-t-slate-400",
        dotColor: "bg-slate-400",
        emptyHint: "Сырые мысли — сбрось через / или быструю запись",
      },
      {
        id: "in_progress",
        label: "В работе",
        accent: "border-t-blue-500",
        dotColor: "bg-blue-500",
        emptyHint: "Темы, с которыми работаешь прямо сейчас",
      },
      {
        id: "analysis",
        label: "Осмысление",
        accent: "border-t-violet-500",
        dotColor: "bg-violet-500",
        emptyHint: "Разбираешь причины, паттерны и связи",
      },
      {
        id: "done",
        label: "Проработано",
        accent: "border-t-emerald-500",
        dotColor: "bg-emerald-500",
        emptyHint: "Принял выводы — тема закрыта",
      },
    ],
  },
};

export const kanbanBoardList = kanbanBoardModes.map((mode) => kanbanBoards[mode]);

/** @deprecated use getKanbanBoardConfig(mode).columns */
export const devKanbanColumns = kanbanBoards.code.columns;

/** @deprecated use board-specific card types */
export const devKanbanCardTypes = kanbanBoards.code.cardTypes.map((item) => item.value) as [
  "feature",
  "bug",
  "idea",
  "tech_debt",
];
export type DevKanbanCardType = (typeof devKanbanCardTypes)[number];

/** @deprecated */
export const devKanbanCardTypeOptions = kanbanBoards.code.cardTypes;

export function parseKanbanBoardMode(value: string | null): KanbanBoardMode {
  if (value === "tasks" || value === "psych") {
    return value;
  }
  return "code";
}

export function getKanbanBoardConfig(mode: KanbanBoardMode): KanbanBoardConfig {
  return kanbanBoards[mode];
}

export function getKanbanBoardId(mode: KanbanBoardMode): string {
  return kanbanBoards[mode].id;
}

export function resolveKanbanBoardMode(entry: Entry): KanbanBoardMode | null {
  const board = getString(entry.metadata.board);
  if (board === kanbanBoards.tasks.id) {
    return "tasks";
  }
  if (board === kanbanBoards.psych.id) {
    return "psych";
  }
  if (board === kanbanBoards.code.id || board === "dev" || board === "thoughts") {
    return "code";
  }
  return null;
}

export function isKanbanEntry(entry: Entry, mode: KanbanBoardMode): boolean {
  return entry.type === "note" && resolveKanbanBoardMode(entry) === mode;
}

/** @deprecated use isKanbanEntry(entry, mode) */
export function isDevKanbanEntry(entry: Entry) {
  return entry.type === "note" && resolveKanbanBoardMode(entry) !== null;
}

export function isAnyKanbanEntry(entry: Entry) {
  return entry.type === "note" && resolveKanbanBoardMode(entry) !== null;
}

export function getDevKanbanStage(entry: Entry): DevKanbanStage {
  const stage = getString(entry.metadata.stage, "inbox");
  if (devKanbanStages.includes(stage as DevKanbanStage)) {
    return stage as DevKanbanStage;
  }
  return LEGACY_STAGE_MAP[stage] ?? "inbox";
}

export function getDevKanbanPriority(entry: Entry) {
  const priority = getNumber(entry.metadata.priority, 3);
  return Math.min(5, Math.max(1, Math.round(priority)));
}

export function getKanbanCardType(entry: Entry, mode: KanbanBoardMode): string {
  const config = getKanbanBoardConfig(mode);
  const cardType = getString(entry.metadata.card_type, config.defaultCardType);
  return config.cardTypes.some((option) => option.value === cardType) ? cardType : config.defaultCardType;
}

/** @deprecated use getKanbanCardType */
export function getDevKanbanCardType(entry: Entry): DevKanbanCardType {
  return getKanbanCardType(entry, resolveKanbanBoardMode(entry) ?? "code") as DevKanbanCardType;
}

export function kanbanMetadata(
  mode: KanbanBoardMode,
  stage: DevKanbanStage,
  options?: { priority?: number; cardType?: string },
) {
  const config = getKanbanBoardConfig(mode);
  const cardType = options?.cardType ?? config.defaultCardType;
  return {
    board: config.id,
    stage,
    priority: options?.priority ?? 3,
    card_type: config.cardTypes.some((option) => option.value === cardType) ? cardType : config.defaultCardType,
  };
}

/** @deprecated use kanbanMetadata */
export function devKanbanMetadata(
  stage: DevKanbanStage,
  options?: { priority?: number; cardType?: DevKanbanCardType },
) {
  return kanbanMetadata("code", stage, options);
}

export function priorityAccent(priority: number) {
  if (priority >= 4) {
    return "bg-rose-500";
  }
  if (priority === 3) {
    return "bg-amber-400";
  }
  return "bg-slate-300";
}

export function priorityLabel(priority: number) {
  if (priority >= 5) {
    return "Критичный";
  }
  if (priority >= 4) {
    return "Высокий";
  }
  if (priority === 3) {
    return "Средний";
  }
  if (priority === 2) {
    return "Низкий";
  }
  return "Минимальный";
}

export function cardTypeOption(mode: KanbanBoardMode, cardType: string) {
  const config = getKanbanBoardConfig(mode);
  return config.cardTypes.find((option) => option.value === cardType) ?? config.cardTypes[0];
}

export const KANBAN_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const KANBAN_MAX_ATTACHMENTS = 20;

export type KanbanSubtask = {
  id: string;
  title: string;
  done: boolean;
};

export type KanbanComment = {
  id: string;
  text: string;
  created_at: string;
};

export type KanbanHistoryEvent = {
  id: string;
  action: "created" | "updated" | "moved" | "comment" | "attachment" | "subtask";
  label: string;
  created_at: string;
};

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function readSubtasks(value: unknown): KanbanSubtask[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const id = getString(record.id);
      const title = getString(record.title).trim();
      if (!id || !title) {
        return null;
      }
      return { id, title, done: Boolean(record.done) };
    })
    .filter((item): item is KanbanSubtask => item !== null);
}

function readComments(value: unknown): KanbanComment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const id = getString(record.id);
      const text = getString(record.text).trim();
      const createdAt = getString(record.created_at);
      if (!id || !text || !createdAt) {
        return null;
      }
      return { id, text, created_at: createdAt };
    })
    .filter((item): item is KanbanComment => item !== null);
}

function readHistory(value: unknown): KanbanHistoryEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const id = getString(record.id);
      const label = getString(record.label).trim();
      const createdAt = getString(record.created_at);
      const action = getString(record.action, "updated") as KanbanHistoryEvent["action"];
      if (!id || !label || !createdAt) {
        return null;
      }
      return { id, action, label, created_at: createdAt };
    })
    .filter((item): item is KanbanHistoryEvent => item !== null);
}

export function getKanbanDeadline(entry: Entry) {
  return getString(entry.metadata.deadline);
}

export function getKanbanAttachmentIds(entry: Entry) {
  return readStringArray(entry.metadata.attachment_ids);
}

export function getKanbanSubtasks(entry: Entry) {
  return readSubtasks(entry.metadata.subtasks);
}

export function getKanbanComments(entry: Entry) {
  return readComments(entry.metadata.comments);
}

export function getKanbanHistory(entry: Entry) {
  return readHistory(entry.metadata.history);
}

export function getKanbanSubtaskProgress(entry: Entry) {
  const subtasks = getKanbanSubtasks(entry);
  const done = subtasks.filter((item) => item.done).length;
  return { done, total: subtasks.length };
}

export function createKanbanId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createKanbanHistoryEvent(
  action: KanbanHistoryEvent["action"],
  label: string,
): KanbanHistoryEvent {
  return {
    id: createKanbanId(),
    action,
    label,
    created_at: new Date().toISOString(),
  };
}

export function appendKanbanHistory(
  current: KanbanHistoryEvent[],
  event: KanbanHistoryEvent,
  limit = 50,
) {
  return [event, ...current].slice(0, limit);
}

export function toDateInputValue(value: string) {
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function formatKanbanDeadline(value: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
