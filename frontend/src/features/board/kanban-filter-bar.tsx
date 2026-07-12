import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type KanbanFilterBarProps = {
  priorityFilter: number | null;
  onPriorityChange: (value: number | null) => void;
  overdueOnly: boolean;
  onOverdueChange: (value: boolean) => void;
};

export function KanbanFilterBar({
  priorityFilter,
  onPriorityChange,
  overdueOnly,
  onOverdueChange,
}: KanbanFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Фильтр по приоритету"
        value={priorityFilter === null ? "" : String(priorityFilter)}
        onChange={(event) => {
          const value = event.target.value;
          onPriorityChange(value ? Number(value) : null);
        }}
        className={cn("kanban-toolbar-input h-9 min-h-9 w-auto min-w-[8.5rem] text-sm")}
      >
        <option value="">Приоритет</option>
        {[5, 4, 3, 2, 1].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </Select>

      <button
        type="button"
        disabled
        className="kanban-filter-inactive focus-ring h-9 cursor-not-allowed rounded-md border px-3 text-sm opacity-60"
        title="Скоро"
      >
        Исполнитель
      </button>

      <button
        type="button"
        aria-pressed={overdueOnly}
        onClick={() => onOverdueChange(!overdueOnly)}
        className={cn(
          "focus-ring h-9 rounded-md border px-3 text-sm font-medium transition",
          overdueOnly ? "kanban-filter-active" : "kanban-filter-inactive",
        )}
      >
        Просрочено
      </button>
    </div>
  );
}
