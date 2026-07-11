import type { KanbanBoardMode, KanbanCardTypeOption } from "@/lib/kanban-core";
import { kanbanBoards } from "@/lib/kanban-core";

export * from "@/lib/kanban-core";
export type KanbanColumnDefinition = {
  id: string;
  label: string;
  emptyHint?: string;
  accent?: string;
  dotColor?: string;
};

export type KanbanBoardDefinition = {
  id: string;
  mode?: KanbanBoardMode | "custom";
  label: string;
  subtitle: string;
  emptyMessage?: string;
  defaultCardType?: string;
  cardTypes?: KanbanCardTypeOption[];
  isBuiltin?: boolean;
  configEntryId?: string;
  columns: KanbanColumnDefinition[];
};

export function getDefaultKanbanBoards(): KanbanBoardDefinition[] {
  return Object.values(kanbanBoards).map((board) => ({
    id: board.id,
    mode: board.mode,
    label: board.label,
    subtitle: board.subtitle,
    emptyMessage: board.emptyMessage,
    defaultCardType: board.defaultCardType,
    cardTypes: board.cardTypes,
    isBuiltin: true,
    columns: board.columns.map((column) => ({
      id: column.id,
      label: column.label,
      emptyHint: column.emptyHint,
      accent: column.accent,
      dotColor: column.dotColor,
    })),
  }));
}

export function findBoardDefinition(
  boards: KanbanBoardDefinition[],
  boardId: string,
): KanbanBoardDefinition | null {
  return boards.find((board) => board.id === boardId) ?? null;
}

export function resolveBoardIdFromQuery(
  boards: KanbanBoardDefinition[],
  params: { board?: string | null; mode?: string | null },
): string {
  if (params.board) {
    const match = boards.find((board) => board.id === params.board);
    if (match) {
      return match.id;
    }
  }

  if (params.mode === "tasks") {
    return "kanban_tasks";
  }
  if (params.mode === "psych") {
    return "kanban_psych";
  }
  return "kanban_code";
}
