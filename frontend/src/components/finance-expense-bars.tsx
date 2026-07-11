"use client";

import { formatCurrency } from "@/lib/entry-helpers";
import { getFinanceCategoryMeta } from "@/lib/finance-category-meta";
import { cn } from "@/lib/utils";

type ExpenseBarItem = {
  category: string;
  total: number;
};

export function FinanceExpenseBars({
  items,
  total,
  className,
  selectedCategory,
  onCategoryClick,
}: {
  items: ExpenseBarItem[];
  total: number;
  className?: string;
  selectedCategory?: string | null;
  onCategoryClick?: (category: string) => void;
}) {
  const max = items.length > 0 ? Math.max(...items.map((item) => item.total)) : 0;

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">В этом месяце нет расходов.</p>;
  }

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => {
        const meta = getFinanceCategoryMeta(item.category);
        const width = max > 0 ? (item.total / max) * 100 : 0;
        const share = total > 0 ? Math.round((item.total / total) * 100) : 0;
        const Icon = meta.icon;

        return (
          <li key={item.category}>
            <button
              type="button"
              onClick={() => onCategoryClick?.(item.category)}
              aria-pressed={selectedCategory === item.category}
              className={cn(
                "group w-full rounded-md text-left transition",
                onCategoryClick && "focus-ring",
                selectedCategory === item.category && "ring-2 ring-primary/40 bg-primary/5 px-1 py-1",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={cn("size-3.5 shrink-0", meta.color)} aria-hidden="true" />
                  <span className="truncate">{item.category}</span>
                  <span className="text-xs text-muted-foreground">{share}%</span>
                </span>
                <span className="shrink-0 font-mono text-sm font-medium">{formatCurrency(item.total, "RUB")}</span>
              </div>
              <div className="relative h-7 overflow-hidden rounded-md bg-muted/60">
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-md transition-all", meta.barColor)}
                  style={{ width: `${Math.max(width, item.total > 0 ? 4 : 0)}%` }}
                />
                <span className="relative z-10 flex h-full items-center px-2 text-xs font-medium text-foreground/90">
                  {formatCurrency(item.total, "RUB")}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
