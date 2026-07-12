"use client";

import { FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { KanbanCardTypeOption } from "@/lib/kanban-boards";

type KanbanProjectPickerProps = {
  id: string;
  projects: KanbanCardTypeOption[];
  value: string;
  onChange: (value: string) => void;
};

export function KanbanProjectPicker({ id, projects, value, onChange }: KanbanProjectPickerProps) {
  if (projects.length <= 1) {
    return null;
  }

  return (
    <div className="mb-2">
      <FieldLabel htmlFor={id} className="mb-1.5 text-xs text-[var(--kanban-muted)]">
        Проект
      </FieldLabel>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="kanban-toolbar-input w-full text-sm"
      >
        {projects.map((project) => (
          <option key={project.value} value={project.value}>
            {project.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
