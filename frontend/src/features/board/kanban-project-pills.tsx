import type { KanbanCardTypeOption } from "@/lib/kanban-boards";
import { cn } from "@/lib/utils";

type KanbanProjectPillsProps = {
  projects: KanbanCardTypeOption[];
  activeProject: string | null;
  onChange: (project: string | null) => void;
};

export function KanbanProjectPills({ projects, activeProject, onChange }: KanbanProjectPillsProps) {
  return (
    <div className="kanban-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Фильтр по проектам">
      <button
        type="button"
        role="tab"
        aria-selected={activeProject === null}
        onClick={() => onChange(null)}
        className={cn(
          "kanban-project-pill focus-ring shrink-0",
          activeProject === null ? "kanban-project-pill-active" : "kanban-filter-inactive",
        )}
      >
        <span className="size-2 rounded-full bg-[var(--kanban-accent)]" aria-hidden="true" />
        Все
      </button>
      {projects.map((project) => (
        <button
          key={project.value}
          type="button"
          role="tab"
          aria-selected={activeProject === project.value}
          onClick={() => onChange(project.value)}
          className={cn(
            "kanban-project-pill focus-ring shrink-0",
            activeProject === project.value ? "kanban-project-pill-active" : "kanban-filter-inactive",
          )}
        >
          <span className={cn("size-2 rounded-full", project.dotColor ?? "bg-slate-400")} aria-hidden="true" />
          {project.label}
        </button>
      ))}
    </div>
  );
}
