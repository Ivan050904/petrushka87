"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { FinanceChartSkeleton } from "@/components/finance-chart-skeleton";
import { FinanceExpenseBars } from "@/components/finance-expense-bars";
import { FinanceIncomeBars } from "@/components/finance-income-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Select } from "@/components/ui/select";
import { FinanceCategoryCard } from "@/features/tracking/finance-category-card";
import { entryDescription, formatCurrency, formatDate, getNumber, getString } from "@/lib/entry-helpers";
import { countUniqueBanks, getAccountDisplay } from "@/lib/finance-account-display";
import {
  aggregateDailyExpenses,
  aggregateMonthlyTotals,
  buildCompareMap,
  categoryMatchesSelection,
} from "@/lib/finance-aggregates";
import { computeKpiDeltaMeta } from "@/lib/finance-category-meta";
import type { FinanceAccount, FinanceSummary } from "@/lib/finance-import";
import { formatMonthLabel, formatMonthShort, monthRange, recentMonths, shiftMonth } from "@/lib/finance-month";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

const FinanceTrendChart = dynamic(
  () => import("@/components/finance-trend-chart").then((mod) => mod.FinanceTrendChart),
  { ssr: false, loading: FinanceChartSkeleton },
);

const FinanceDailyChart = dynamic(
  () => import("@/components/finance-daily-chart").then((mod) => mod.FinanceDailyChart),
  { ssr: false, loading: FinanceChartSkeleton },
);

type CategorySide = "expense" | "income";

type CategorySelection = {
  category: string;
  side: CategorySide;
  sourceCategories?: string[];
};

export function FinanceDashboard({
  summary,
  compareSummary,
  entries,
  accounts,
  isLoading,
  month,
  compareMonth,
  onMonthChange,
  onCompareMonthChange,
}: {
  summary: FinanceSummary | null;
  compareSummary: FinanceSummary | null;
  entries: Entry[];
  accounts: FinanceAccount[];
  isLoading: boolean;
  month: string;
  compareMonth: string;
  onMonthChange: (month: string) => void;
  onCompareMonthChange: (month: string) => void;
}) {
  const [selection, setSelection] = useState<CategorySelection | null>(null);
  const monthLabel = formatMonthLabel(month);
  const compareMonthLabel = formatMonthShort(compareMonth);
  const monthPills = useMemo(() => recentMonths(6, month), [month]);
  const compareOptions = useMemo(() => recentMonths(12, month), [month]);

  const expenseCategoriesRaw = useMemo(
    () => summary?.by_expense_category ?? summary?.by_category ?? [],
    [summary],
  );
  const incomeCategoriesRaw = useMemo(() => summary?.by_income_category ?? [], [summary]);
  const compareExpenseMap = useMemo(
    () => buildCompareMap(compareSummary?.by_expense_category ?? compareSummary?.by_category ?? []),
    [compareSummary],
  );
  const compareIncomeMap = useMemo(
    () => buildCompareMap(compareSummary?.by_income_category ?? []),
    [compareSummary],
  );

  const expenseCategories = useMemo(
    () => expenseCategoriesRaw.map((item) => ({ category: item.category, total: item.total })),
    [expenseCategoriesRaw],
  );
  const incomeCategories = useMemo(
    () => incomeCategoriesRaw.map((item) => ({ category: item.category, total: item.total })),
    [incomeCategoriesRaw],
  );

  const topExpenseCategories = expenseCategoriesRaw.slice(0, 4).map((item) => ({
    category: item.category,
    total: item.total,
  }));
  const topIncomeCategories = incomeCategoriesRaw.slice(0, 4).map((item) => ({
    category: item.category,
    total: item.total,
  }));

  const trendData = useMemo(
    () => aggregateMonthlyTotals(entries, recentMonths(12, month)),
    [entries, month],
  );
  const dailyData = useMemo(() => aggregateDailyExpenses(entries, month), [entries, month]);

  useEffect(() => {
    setSelection(null);
  }, [month]);

  const categoryEntries = useMemo(() => {
    if (!selection) {
      return [];
    }
    const [from, to] = monthRange(month);
    return entries
      .filter((entry) => {
        const kind = getString(entry.metadata.kind);
        if (kind === "transfer") {
          return false;
        }
        const category = getString(entry.metadata.category, "Прочее");
        if (!categoryMatchesSelection(category, selection.category, selection.sourceCategories)) {
          return false;
        }
        const effectiveKind = kind || getString(entry.metadata.direction);
        if (selection.side === "income" && effectiveKind !== "income") {
          return false;
        }
        if (selection.side === "expense" && effectiveKind !== "expense") {
          return false;
        }
        const date = getString(entry.metadata.transaction_date, entry.updated_at.slice(0, 10));
        return date >= from && date <= to;
      })
      .sort((left, right) => {
        const leftDate = getString(left.metadata.transaction_date, left.updated_at);
        const rightDate = getString(right.metadata.transaction_date, right.updated_at);
        return rightDate.localeCompare(leftDate);
      });
  }, [entries, month, selection]);

  function toggleCategory(category: string, side: CategorySide, sourceCategories?: string[]) {
    if (selection?.category === category && selection.side === side) {
      setSelection(null);
      return;
    }
    setSelection({ category, side, sourceCategories });
  }

  function clearCategorySelection() {
    setSelection(null);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-12 rounded-xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 rounded-xl bg-muted" />
          <div className="h-64 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!summary || (summary.income === 0 && summary.expense === 0)) {
    return (
      <div className="flex flex-col gap-4">
        <DashboardFilters
          month={month}
          compareMonth={compareMonth}
          monthPills={monthPills}
          compareOptions={compareOptions}
          onMonthChange={onMonthChange}
          onCompareMonthChange={onCompareMonthChange}
        />
        <Empty
          title="В этом месяце пока нет данных"
          description="Импортируйте выписку или выберите другой месяц."
        />
      </div>
    );
  }

  const expenseDelta = computeKpiDeltaMeta("expense", summary.expense, compareSummary?.expense ?? 0);
  const incomeDelta = computeKpiDeltaMeta("income", summary.income, compareSummary?.income ?? 0);
  const balanceDelta = computeKpiDeltaMeta("balance", summary.balance, compareSummary?.balance ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <DashboardFilters
        month={month}
        compareMonth={compareMonth}
        monthPills={monthPills}
        compareOptions={compareOptions}
        onMonthChange={onMonthChange}
        onCompareMonthChange={onCompareMonthChange}
      />

      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-3">
        <KpiBlock
          label="Расход"
          value={formatCurrency(summary.expense, "RUB")}
          delta={expenseDelta}
          compareLabel={compareMonthLabel}
          tone="expense"
        />
        <KpiBlock
          label="Разница"
          value={formatCurrency(summary.balance, "RUB")}
          delta={balanceDelta}
          compareLabel={compareMonthLabel}
          tone={summary.balance >= 0 ? "income" : "expense"}
        />
        <KpiBlock
          label="Доход"
          value={formatCurrency(summary.income, "RUB")}
          delta={incomeDelta}
          compareLabel={compareMonthLabel}
          tone="income"
        />
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Тренд за 12 месяцев</CardTitle>
          <p className="text-sm text-muted-foreground">Расход, доход и разница по месяцам</p>
        </CardHeader>
        <CardContent>
          <FinanceTrendChart data={trendData} />
        </CardContent>
      </Card>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Расходы по категориям</CardTitle>
            <p className="text-sm text-muted-foreground">
              {monthLabel}
              {expenseCategories.length > 0
                ? ` · ${expenseCategories.length} ${expenseCategories.length === 1 ? "категория" : expenseCategories.length < 5 ? "категории" : "категорий"}`
                : null}
            </p>
          </CardHeader>
          <CardContent>
            <FinanceExpenseBars
              items={expenseCategories}
              total={summary.expense}
              selectedCategory={selection?.side === "expense" ? selection.category : null}
              onCategoryClick={(category, sourceCategories) => toggleCategory(category, "expense", sourceCategories)}
              compareByCategory={compareExpenseMap}
              compareMonthLabel={compareMonthLabel}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Доходы</CardTitle>
            <p className="text-sm text-muted-foreground">
              {monthLabel}
              {incomeCategories.length > 0
                ? ` · ${incomeCategories.length} ${incomeCategories.length === 1 ? "категория" : incomeCategories.length < 5 ? "категории" : "категорий"}`
                : null}
            </p>
          </CardHeader>
          <CardContent>
            <FinanceIncomeBars
              items={incomeCategories}
              total={summary.income}
              selectedCategory={selection?.side === "income" ? selection.category : null}
              onCategoryClick={(category, sourceCategories) => toggleCategory(category, "income", sourceCategories)}
              compareByCategory={compareIncomeMap}
              compareMonthLabel={compareMonthLabel}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Расход по дням</CardTitle>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </CardHeader>
        <CardContent>
          <FinanceDailyChart data={dailyData} month={month} />
        </CardContent>
      </Card>

      {topExpenseCategories.length > 0 || topIncomeCategories.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {topExpenseCategories.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Топ категорий расходов</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {topExpenseCategories.map((item) => (
                  <FinanceCategoryCard
                    key={item.category}
                    category={item.category}
                    total={item.total}
                    expenseTotal={summary.expense}
                    compareTotal={compareExpenseMap.get(item.category) ?? 0}
                    compareMonthLabel={compareMonthLabel}
                    selected={selection?.category === item.category && selection.side === "expense"}
                    onClick={() => toggleCategory(item.category, "expense")}
                    side="expense"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {topIncomeCategories.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Топ категорий доходов</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {topIncomeCategories.map((item) => (
                  <FinanceCategoryCard
                    key={item.category}
                    category={item.category}
                    total={item.total}
                    expenseTotal={summary.income}
                    compareTotal={compareIncomeMap.get(item.category) ?? 0}
                    compareMonthLabel={compareMonthLabel}
                    selected={selection?.category === item.category && selection.side === "income"}
                    onClick={() => toggleCategory(item.category, "income")}
                    side="income"
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {selection ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Операции: {selection.category}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {monthLabel}
                {categoryEntries.length > 0
                  ? ` · ${categoryEntries.length} ${categoryEntries.length === 1 ? "операция" : "операций"} · ${countUniqueBanks(categoryEntries)} ${countUniqueBanks(categoryEntries) === 1 ? "банк" : "банка"}`
                  : null}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearCategorySelection}>
              <X data-icon="inline-start" />
              Сбросить
            </Button>
          </CardHeader>
          <CardContent>
            {categoryEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Операций в этой категории за месяц нет.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {categoryEntries.map((entry) => {
                  const amount = getNumber(entry.metadata.amount);
                  const currency = getString(entry.metadata.currency, "RUB");
                  const effectiveKind = getString(entry.metadata.kind, getString(entry.metadata.direction, "expense"));
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{entryDescription(entry)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(getString(entry.metadata.transaction_date, entry.updated_at))}</span>
                          <Badge variant="secondary">{getAccountDisplay(entry, accounts)}</Badge>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-sm font-semibold",
                          effectiveKind === "income" && "text-success",
                          effectiveKind === "expense" && "text-destructive",
                        )}
                      >
                        {formatCurrency(amount, currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Переводы между своими счетами ({summary.transfers}) не входят в расходы и доходы.
        {compareSummary ? ` Сравнение с ${formatMonthLabel(compareMonth)}.` : null}
      </p>
    </div>
  );
}

function DashboardFilters({
  month,
  compareMonth,
  monthPills,
  compareOptions,
  onMonthChange,
  onCompareMonthChange,
}: {
  month: string;
  compareMonth: string;
  monthPills: string[];
  compareOptions: string[];
  onMonthChange: (month: string) => void;
  onCompareMonthChange: (month: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <ChevronLeft data-icon="inline-start" />
        </Button>
        <div className="flex flex-wrap gap-1.5">
          {monthPills.map((pill) => (
            <button
              key={pill}
              type="button"
              onClick={() => onMonthChange(pill)}
              className={cn(
                "focus-ring min-h-11 rounded-md px-2.5 py-1.5 text-sm capitalize transition lg:min-h-10 lg:py-1",
                pill === month
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {formatMonthShort(pill)}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <ChevronRight data-icon="inline-end" />
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">{formatMonthLabel(month)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Сравнить с</span>
        <Select
          value={compareMonth}
          onChange={(event) => onCompareMonthChange(event.target.value)}
          className="w-[160px]"
        >
          {compareOptions
            .filter((option) => option !== month)
            .map((option) => (
              <option key={option} value={option}>
                {formatMonthLabel(option)}
              </option>
            ))}
        </Select>
      </div>
    </div>
  );
}

function KpiBlock({
  label,
  value,
  delta,
  compareLabel,
  tone,
}: {
  label: string;
  value: string;
  delta: { label: string | null; sentiment: "good" | "bad" | "neutral" };
  compareLabel: string;
  tone: "expense" | "income";
}) {
  return (
    <div className="text-center sm:text-left">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-2xl font-bold tracking-tight",
          tone === "expense" && "text-destructive",
          tone === "income" && "text-success",
        )}
      >
        {value}
      </div>
      {delta.label ? (
        <div
          className={cn(
            "mt-1 text-xs font-medium",
            delta.sentiment === "good" && "text-success",
            delta.sentiment === "bad" && "text-destructive",
            delta.sentiment === "neutral" && "text-muted-foreground",
          )}
        >
          {delta.label} к {compareLabel}
        </div>
      ) : null}
    </div>
  );
}
