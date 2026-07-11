"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/entry-helpers";
import { computeCategoryDelta, getFinanceCategoryMeta } from "@/lib/finance-category-meta";
import { cn } from "@/lib/utils";

export function FinanceCategoryCard({
  category,
  total,
  expenseTotal,
  compareTotal,
  compareMonthLabel,
  selected = false,
  onClick,
}: {
  category: string;
  total: number;
  expenseTotal: number;
  compareTotal: number;
  compareMonthLabel: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const meta = getFinanceCategoryMeta(category);
  const Icon = meta.icon;
  const share = expenseTotal > 0 ? Math.round((total / expenseTotal) * 100) : 0;
  const delta = computeCategoryDelta(total, compareTotal);

  return (
    <Card
      className={cn(
        "overflow-hidden transition",
        onClick && "cursor-pointer hover:border-primary/40 hover:shadow-sm",
        selected && "border-primary/50 ring-2 ring-primary/20",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("flex size-9 items-center justify-center rounded-lg bg-muted/60", meta.color)}>
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
              delta.trend === "up" && "bg-destructive/10 text-destructive",
              delta.trend === "down" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              delta.trend === "flat" && "bg-muted text-muted-foreground",
              delta.trend === "new" && "bg-primary/10 text-primary",
            )}
            title={`Сравнение с ${compareMonthLabel}`}
          >
            {delta.trend === "up" ? <ArrowUpRight className="size-3" /> : null}
            {delta.trend === "down" ? <ArrowDownRight className="size-3" /> : null}
            {delta.trend === "flat" ? <Minus className="size-3" /> : null}
            {delta.label}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-sm text-muted-foreground">{category}</div>
          <div className="mt-0.5 font-mono text-lg font-semibold">{formatCurrency(total, "RUB")}</div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{share}% расходов</span>
          <span>к {compareMonthLabel}</span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", meta.barColor)} style={{ width: `${share}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
