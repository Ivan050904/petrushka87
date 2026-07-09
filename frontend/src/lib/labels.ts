import type { EntryType } from "@/lib/types";

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  task: "Задача",
  reminder: "Напоминание",
  event: "Событие",
  finance: "Финансы",
  habit: "Привычка",
  food: "Питание",
  person: "Человек",
  note: "Заметка",
  diary: "Дневник",
  resource: "Ресурс",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  inbox: "Не выполнена",
  active: "В работе",
  done: "Выполнена",
  cancelled: "Отменена",
  open: "Открытые",
  all: "Все",
};

const FINANCE_DIRECTION_LABELS: Record<string, string> = {
  expense: "Расход",
  income: "Доход",
};

const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочный",
};

export function formatEntryType(type: EntryType | "all") {
  return type === "all" ? "Все" : ENTRY_TYPE_LABELS[type];
}

export function formatTaskStatus(status: string) {
  return TASK_STATUS_LABELS[status] ?? status;
}

export function formatTaskPriority(priority: string) {
  return TASK_PRIORITY_LABELS[priority] ?? priority;
}

export function formatFinanceDirection(direction: string) {
  return FINANCE_DIRECTION_LABELS[direction] ?? direction;
}
