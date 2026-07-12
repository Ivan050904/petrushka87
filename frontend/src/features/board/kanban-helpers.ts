import { getKanbanDeadline } from "@/lib/kanban-boards";
import type { Entry } from "@/lib/types";

export function formatKanbanCardDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function isKanbanOverdue(entry: Entry) {
  const deadline = getKanbanDeadline(entry);
  if (!deadline) {
    return false;
  }
  const date = new Date(deadline.includes("T") ? deadline : `${deadline}T23:59:59`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.getTime() < Date.now();
}

export function kanbanUserInitials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name ?? email ?? "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
