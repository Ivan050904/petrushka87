"use client";

import type { TrackingTab } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const trackingTabOptions: Array<{ value: TrackingTab; label: string }> = [
  { value: "habits", label: "Привычки" },
  { value: "finance", label: "Финансы" },
  { value: "food", label: "Питание" },
];

export function TrackingTabPills({
  value,
  onChange,
}: {
  value: TrackingTab;
  onChange: (value: TrackingTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Разделы трекинга">
      {trackingTabOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "filter-pill filter-pill-compact xl:min-h-9 xl:px-3 xl:text-sm",
            value === option.value ? "filter-pill-active" : "filter-pill-inactive",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
