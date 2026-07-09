"use client";

import { useMemo } from "react";
import { BarChart3, PieChart } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { formatCurrency } from "@/lib/entry-helpers";
import type { FinanceSummary } from "@/lib/finance-import";

export function FinanceDashboard({
  summary,
  isLoading,
}: {
  summary: FinanceSummary | null;
  isLoading: boolean;
}) {
  const maxCategory = useMemo(() => {
    if (!summary?.by_category.length) {
      return 0;
    }
    return Math.max(...summary.by_category.map((item) => item.total));
  }, [summary]);

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
      <Empty
        title="Дашборд пока пуст"
        description="Импортируйте выписку из банка — здесь появятся расходы по категориям и динамика."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Доходы" value={formatCurrency(summary.income, "RUB")} />
        <MetricCard label="Расходы" value={formatCurrency(summary.expense, "RUB")} />
        <MetricCard label="Баланс" value={formatCurrency(summary.balance, "RUB")} />
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <PieChart className="size-4" aria-hidden="true" />
            Расходы по категориям
          </CardTitle>
          <span className="text-sm text-muted-foreground">без переводов ({summary.transfers})</span>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.by_category.length === 0 ? (
            <p className="text-sm text-muted-foreground">Категорий пока нет. Запустите ИИ-категоризацию при импорте.</p>
          ) : (
            summary.by_category.map((item) => (
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
            Сводка
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Переводы между своими счетами ({summary.transfers}) не входят в расходы.
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
