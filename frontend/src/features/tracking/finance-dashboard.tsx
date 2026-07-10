"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, PieChart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/entry-helpers";
import type { FinanceSummary } from "@/lib/finance-import";
import { formatMonthLabel, shiftMonth } from "@/lib/finance-month";
import { cn } from "@/lib/utils";

type DashboardView = "expense" | "income";

export function FinanceDashboard({
  summary,
  isLoading,
  month,
  onMonthChange,
}: {
  summary: FinanceSummary | null;
  isLoading: boolean;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const [view, setView] = useState<DashboardView>("expense");

  const categories = useMemo(() => {
    if (!summary) {
      return [];
    }
    return view === "expense"
      ? summary.by_expense_category ?? summary.by_category
      : summary.by_income_category ?? [];
  }, [summary, view]);

  const maxCategory = useMemo(() => {
    if (categories.length === 0) {
      return 0;
    }
    return Math.max(...categories.map((item) => item.total));
  }, [categories]);

  const monthLabel = formatMonthLabel(month);
  const mainTotal = view === "expense" ? summary?.expense ?? 0 : summary?.income ?? 0;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-28 rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!summary || (summary.income === 0 && summary.expense === 0)) {
    return (
      <div className="flex flex-col gap-4">
        <MonthToolbar month={month} onMonthChange={onMonthChange} />
        <Empty
          title="В этом месяце пока нет данных"
          description="Импортируйте выписку или выберите другой месяц."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MonthToolbar month={month} onMonthChange={onMonthChange} />

      <div className="flex flex-wrap gap-2">
        <ViewToggle view={view} onChange={setView} />
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Доходы" value={formatCurrency(summary.income, "RUB")} active={view === "income"} />
        <MetricCard label="Расходы" value={formatCurrency(summary.expense, "RUB")} active={view === "expense"} />
        <MetricCard label="Баланс" value={formatCurrency(summary.balance, "RUB")} />
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <PieChart className="size-4" aria-hidden="true" />
            {view === "expense" ? "Расходы" : "Доходы"} по категориям — {monthLabel}
          </CardTitle>
          <span className="text-sm font-mono font-medium">{formatCurrency(mainTotal, "RUB")}</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {view === "expense" ? "В этом месяце нет расходов." : "В этом месяце нет доходов."}
            </p>
          ) : (
            categories.map((item) => (
              <div key={item.category} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{item.category}</span>
                  <span className="font-mono font-medium">{formatCurrency(item.total, "RUB")}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${maxCategory > 0 ? (item.total / maxCategory) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4" aria-hidden="true" />
            Сводка за {monthLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Переводы между своими счетами ({summary.transfers}) не входят в расходы и доходы.
        </CardContent>
      </Card>
    </div>
  );
}

function MonthToolbar({ month, onMonthChange }: { month: string; onMonthChange: (month: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => onMonthChange(shiftMonth(month, -1))}>
        <ChevronLeft data-icon="inline-start" />
        Назад
      </Button>
      <Input type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} className="w-[170px]" />
      <Button type="button" variant="outline" size="sm" onClick={() => onMonthChange(shiftMonth(month, 1))}>
        Вперёд
        <ChevronRight data-icon="inline-end" />
      </Button>
      <span className="text-sm text-muted-foreground">{formatMonthLabel(month)}</span>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: DashboardView; onChange: (view: DashboardView) => void }) {
  return (
    <div className="inline-flex rounded-md border p-1">
      <button
        type="button"
        className={cn(
          "rounded px-3 py-1.5 text-sm transition",
          view === "expense" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
        )}
        onClick={() => onChange("expense")}
      >
        Расходы
      </button>
      <button
        type="button"
        className={cn(
          "rounded px-3 py-1.5 text-sm transition",
          view === "income" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
        )}
        onClick={() => onChange("income")}
      >
        Доходы
      </button>
    </div>
  );
}

function MetricCard({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <Card className={cn(active && "border-primary/50")}>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
