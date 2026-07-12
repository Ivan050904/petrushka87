"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { formatCurrency } from "@/lib/entry-helpers";
import type { FinanceCategoryItem } from "@/lib/finance-aggregates";
import { resolveCompareTotal } from "@/lib/finance-aggregates";
import { computeCategoryDelta, getDonutColor, getFinanceCategoryMeta } from "@/lib/finance-category-meta";
import { cn } from "@/lib/utils";

function CategoryDeltaBadge({
  current,
  compareTotal,
  compareMonthLabel,
  invertSentiment = false,
}: {
  current: number;
  compareTotal: number;
  compareMonthLabel?: string;
  invertSentiment?: boolean;
}) {
  const delta = computeCategoryDelta(current, compareTotal);
  const trend = invertSentiment
    ? delta.trend === "up"
      ? "down"
      : delta.trend === "down"
        ? "up"
        : delta.trend
    : delta.trend;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        trend === "up" && "bg-success-soft",
        trend === "down" && "bg-destructive/10 text-destructive",
        trend === "flat" && "bg-muted text-muted-foreground",
        trend === "new" && "bg-primary/10 text-primary",
      )}
      title={compareMonthLabel ? `Сравнение с ${compareMonthLabel}` : undefined}
    >
      {delta.trend === "up" ? <ArrowUpRight className="size-2.5" /> : null}
      {delta.trend === "down" ? <ArrowDownRight className="size-2.5" /> : null}
      {delta.trend === "flat" ? <Minus className="size-2.5" /> : null}
      {delta.label}
    </span>
  );
}

export function FinanceIncomeBars({
  items,
  total,
  className,
  selectedCategory,
  onCategoryClick,
  compareByCategory,
  compareMonthLabel,
}: {
  items: FinanceCategoryItem[];
  total: number;
  className?: string;
  selectedCategory?: string | null;
  onCategoryClick?: (category: string, sourceCategories?: string[]) => void;
  compareByCategory?: Map<string, number>;
  compareMonthLabel?: string;
}) {
  const max = items.length > 0 ? Math.max(...items.map((item) => item.total)) : 0;

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">В этом месяце нет доходов.</p>;
  }

  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item, index) => {
        const meta = getFinanceCategoryMeta(item.category);
        const width = max > 0 ? (item.total / max) * 100 : 0;
        const share = total > 0 ? Math.round((item.total / total) * 100) : 0;
        const Icon = meta.icon;
        const barColor = getDonutColor(index);
        const compareTotal = compareByCategory
          ? resolveCompareTotal(item.category, compareByCategory, item.sourceCategories)
          : 0;

        return (
          <li key={item.category}>
            <button
              type="button"
              onClick={() => onCategoryClick?.(item.category, item.sourceCategories)}
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
                <span className="flex shrink-0 items-center gap-1.5">
                  {compareByCategory ? (
                    <CategoryDeltaBadge
                      current={item.total}
                      compareTotal={compareTotal}
                      compareMonthLabel={compareMonthLabel}
                      invertSentiment
                    />
                  ) : null}
                  <span className="font-mono text-sm font-medium">{formatCurrency(item.total, "RUB")}</span>
                </span>
              </div>
              <div className="relative h-7 overflow-hidden rounded-md bg-muted/60">
                <div
                  className="absolute inset-y-0 left-0 rounded-md transition-all"
                  style={{
                    width: `${Math.max(width, item.total > 0 ? 4 : 0)}%`,
                    backgroundColor: barColor,
                  }}
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
