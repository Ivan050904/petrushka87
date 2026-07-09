import { Button } from "@/components/ui/button";

export function KanbanEmptyState({
  message,
  onAdd,
}: {
  message: string;
  onAdd: () => void;
}) {
  return (
    <div className="kanban-empty-state mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-8 text-center">
      <p className="text-sm leading-6 text-[#1f2328]">{message}</p>
      <Button
        type="button"
        variant="outline"
        className="border-[var(--kanban-border)] bg-white hover:bg-[#f6f8fa]"
        onClick={onAdd}
      >
        Добавить карточку
      </Button>
    </div>
  );
}
