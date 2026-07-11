"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { FinanceExpenseBars } from "@/components/finance-expense-bars";
import { FinanceIncomeDonut } from "@/components/finance-income-donut";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Select } from "@/components/ui/select";
import { FinanceCategoryCard } from "@/features/tracking/finance-category-card";
import { entryDescription, formatCurrency, formatDate, getNumber, getString } from "@/lib/entry-helpers";
import { countUniqueBanks, getAccountDisplay } from "@/lib/finance-account-display";
import { computeKpiDelta } from "@/lib/finance-category-meta";
import type { FinanceAccount, FinanceSummary } from "@/lib/finance-import";
import { formatMonthLabel, formatMonthShort, monthRange, recentMonths, shiftMonth } from "@/lib/finance-month";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type CategorySide = "expense" | "income";

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCategorySide, setSelectedCategorySide] = useState<CategorySide | null>(null);
  const monthLabel = formatMonthLabel(month);
  const compareMonthLabel = formatMonthShort(compareMonth);
  const monthPills = useMemo(() => recentMonths(6, month), [month]);
  const compareOptions = useMemo(() => recentMonths(12, month), [month]);

  const expenseCategories = summary?.by_expense_category ?? summary?.by_category ?? [];
  const incomeCategories = summary?.by_income_category ?? [];
  const compareExpenseMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of compareSummary?.by_expense_category ?? compareSummary?.by_category ?? []) {
      map.set(item.category, item.total);
    }
    return map;
  }, [compareSummary]);

  const topCategories = expenseCategories.slice(0, 4);

  useEffect(() => {
    setSelectedCategory(null);
    setSelectedCategorySide(null);
  }, [month]);

  const categoryEntries = useMemo(() => {
    if (!selectedCategory || !selectedCategorySide) {
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
        if (category !== selectedCategory) {
          return false;
        }
        const effectiveKind = kind || getString(entry.metadata.direction);
        if (selectedCategorySide === "income" && effectiveKind !== "income") {
          return false;
        }
        if (selectedCategorySide === "expense" && effectiveKind !== "expense") {
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
  }, [entries, month, selectedCategory, selectedCategorySide]);

  function toggleCategory(category: string, side: CategorySide) {
    if (selectedCategory === category && selectedCategorySide === side) {
      setSelectedCategory(null);
      setSelectedCategorySide(null);
      return;
    }
    setSelectedCategory(category);
    setSelectedCategorySide(side);
  }

  function clearCategorySelection() {
    setSelectedCategory(null);
    setSelectedCategorySide(null);
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

  const expenseDelta = computeKpiDelta(summary.expense, compareSummary?.expense ?? 0);
  const incomeDelta = computeKpiDelta(summary.income, compareSummary?.income ?? 0);
  const balanceDelta = computeKpiDelta(summary.balance, compareSummary?.balance ?? 0);

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

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Расходы по категориям</CardTitle>
            <p className="text-sm text-muted-foreground">{monthLabel}</p>
          </CardHeader>
          <CardContent>
            <FinanceExpenseBars
              items={expenseCategories}
              total={summary.expense}
              selectedCategory={selectedCategorySide === "expense" ? selectedCategory : null}
              onCategoryClick={(category) => toggleCategory(category, "expense")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Доходы</CardTitle>
            <p className="text-sm text-muted-foreground">{monthLabel}</p>
          </CardHeader>
          <CardContent>
            <FinanceIncomeDonut
              items={incomeCategories}
              total={summary.income}
              selectedCategory={selectedCategorySide === "income" ? selectedCategory : null}
              onCategoryClick={(category) => toggleCategory(category, "income")}
            />
          </CardContent>
        </Card>
      </section>

      {topCategories.length > 0 ? (
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Топ категорий расходов</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {topCategories.map((item) => (
              <FinanceCategoryCard
                key={item.category}
                category={item.category}
                total={item.total}
                expenseTotal={summary.expense}
                compareTotal={compareExpenseMap.get(item.category) ?? 0}
                compareMonthLabel={compareMonthLabel}
                selected={selectedCategory === item.category && selectedCategorySide === "expense"}
                onClick={() => toggleCategory(item.category, "expense")}
              />
            ))}
          </div>
        </section>
      ) : null}

      {selectedCategory ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Операции: {selectedCategory}</CardTitle>
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
                          effectiveKind === "income" && "text-emerald-600 dark:text-emerald-400",
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
  delta: string | null;
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
          tone === "income" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </div>
      {delta ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {delta} к {compareLabel}
        </div>
      ) : null}
    </div>
  );
}
