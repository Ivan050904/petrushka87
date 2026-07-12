"use client";

import { formatCurrency } from "@/lib/entry-helpers";
import { computeKpiDeltaMeta } from "@/lib/finance-category-meta";
import type { FinanceSummary } from "@/lib/finance-import";
import { formatMonthShort } from "@/lib/finance-month";
import { cn } from "@/lib/utils";

type FinanceMonthWidgetProps = {
  summary: FinanceSummary | null;
  compareSummary: FinanceSummary | null;
  compareMonth: string;
  isLoading: boolean;
};

export function FinanceMonthWidget({
  summary,
  compareSummary,
  compareMonth,
  isLoading,
}: FinanceMonthWidgetProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-6 w-full rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
    );
  }

  if (!summary || (summary.income === 0 && summary.expense === 0)) {
    return <p className="text-sm text-muted-foreground">В этом месяце операций пока нет</p>;
  }

  const expenseDelta = computeKpiDeltaMeta("expense", summary.expense, compareSummary?.expense ?? 0);
  const topExpense = summary.by_expense_category[0] ?? summary.by_category[0] ?? null;
  const compareLabel = formatMonthShort(compareMonth);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center sm:text-left">
        <Metric label="Расход" value={summary.expense} tone="expense" />
        <Metric label="Разница" value={summary.balance} tone={summary.balance >= 0 ? "income" : "expense"} />
        <Metric label="Доход" value={summary.income} tone="income" />
      </div>

      {expenseDelta.label ? (
        <p
          className={cn(
            "text-xs font-medium",
            expenseDelta.sentiment === "good" && "text-success",
            expenseDelta.sentiment === "bad" && "text-destructive",
            expenseDelta.sentiment === "neutral" && "text-muted-foreground",
          )}
        >
          Расход {expenseDelta.label} к {compareLabel}
        </p>
      ) : null}

      {topExpense ? (
        <p className="text-xs text-muted-foreground">
          Топ расход: <span className="font-medium text-foreground">{topExpense.category}</span>{" "}
          <span className="font-mono">{formatCurrency(topExpense.total, "RUB")}</span>
        </p>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "expense" | "income";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-mono text-sm font-semibold",
          tone === "expense" && "text-destructive",
          tone === "income" && "text-success",
        )}
      >
        {formatCurrency(value, "RUB")}
      </div>
    </div>
  );
}
