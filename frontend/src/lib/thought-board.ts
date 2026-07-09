import type { Entry } from "@/lib/types";
import { getNumber, getString } from "@/lib/entry-helpers";

export const THOUGHT_BOARD_ID = "thoughts" as const;

export const thoughtStages = ["raw", "decision", "doing", "done"] as const;
export type ThoughtStage = (typeof thoughtStages)[number];

export type ThoughtColumn = {
  id: ThoughtStage;
  label: string;
  accent: string;
  emptyHint: string;
};

export const thoughtColumns: ThoughtColumn[] = [
  {
    id: "raw",
    label: "Сырые мысли",
    accent: "border-t-white/80",
    emptyHint: "Сбрось сюда всё, что крутится в голове",
  },
  {
    id: "decision",
    label: "Решение",
    accent: "border-t-amber-400",
    emptyHint: "Мысли, по которым уже есть вывод",
  },
  {
    id: "doing",
    label: "Делаю сейчас",
    accent: "border-t-sky-400",
    emptyHint: "То, что двигаешь прямо сейчас",
  },
  {
    id: "done",
    label: "Готово",
    accent: "border-t-emerald-400",
    emptyHint: "Перетащи сюда, когда закрыл вопрос",
  },
];

export function isThoughtBoardEntry(entry: Entry) {
  return entry.type === "note" && getString(entry.metadata.board) === THOUGHT_BOARD_ID;
}

export function getThoughtStage(entry: Entry): ThoughtStage {
  const stage = getString(entry.metadata.stage, "raw");
  return thoughtStages.includes(stage as ThoughtStage) ? (stage as ThoughtStage) : "raw";
}

export function getThoughtPriority(entry: Entry) {
  const priority = getNumber(entry.metadata.priority, 3);
  return Math.min(5, Math.max(1, Math.round(priority)));
}

export function thoughtBoardMetadata(stage: ThoughtStage, priority = 3) {
  return {
    board: THOUGHT_BOARD_ID,
    stage,
    priority,
  };
}

export function priorityAccent(priority: number) {
  if (priority >= 4) {
    return "bg-rose-500";
  }
  if (priority === 3) {
    return "bg-amber-400";
  }
  return "bg-emerald-400";
}

export function priorityLabel(priority: number) {
  return String(priority);
}
