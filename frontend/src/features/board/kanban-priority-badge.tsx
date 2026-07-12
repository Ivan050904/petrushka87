import { priorityAccent } from "@/lib/kanban-boards";
import { cn } from "@/lib/utils";

type KanbanPriorityBadgeProps = {
  priority: number;
  className?: string;
};

export function KanbanPriorityBadge({ priority, className }: KanbanPriorityBadgeProps) {
  return (
    <span
      className={cn("kanban-priority-badge", priorityAccent(priority), className)}
      title={`Приоритет ${priority}`}
      aria-label={`Приоритет ${priority}`}
    >
      {priority}
    </span>
  );
}
