import { getNumber, getString } from "@/lib/entry-helpers";
import { monthRange } from "@/lib/finance-month";
import type { Entry } from "@/lib/types";

export type FinanceCategoryItem = {
  category: string;
  total: number;
  sourceCategories?: string[];
};

export type MonthlyTotal = {
  month: string;
  income: number;
  expense: number;
  balance: number;
};

export type DailyExpense = {
  day: number;
  total: number;
  label: string;
};

function readFinanceKind(entry: Entry): string {
  const kind = getString(entry.metadata.kind);
  if (kind === "transfer") {
    return "transfer";
  }
  return kind || getString(entry.metadata.direction);
}

export function monthKeyFromEntry(entry: Entry): string {
  const date = getString(entry.metadata.transaction_date, entry.updated_at.slice(0, 10));
  return date.slice(0, 7);
}

export function buildCompareMap(categories: Array<{ category: string; total: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of categories) {
    map.set(item.category, item.total);
  }
  return map;
}

export function aggregateMonthlyTotals(entries: Entry[], months: string[]): MonthlyTotal[] {
  const monthSet = new Set(months);
  const totals = new Map<string, { income: number; expense: number }>();

  for (const month of months) {
    totals.set(month, { income: 0, expense: 0 });
  }

  for (const entry of entries) {
    const monthKey = monthKeyFromEntry(entry);
    if (!monthSet.has(monthKey)) {
      continue;
    }

    const kind = readFinanceKind(entry);
    if (kind === "transfer") {
      continue;
    }

    const amount = getNumber(entry.metadata.amount);
    const bucket = totals.get(monthKey);
    if (!bucket) {
      continue;
    }

    if (kind === "income") {
      bucket.income += amount;
    } else if (kind === "expense") {
      bucket.expense += amount;
    }
  }

  return months.map((month) => {
    const bucket = totals.get(month) ?? { income: 0, expense: 0 };
    return {
      month,
      income: bucket.income,
      expense: bucket.expense,
      balance: bucket.income - bucket.expense,
    };
  });
}

export function aggregateDailyExpenses(entries: Entry[], month: string): DailyExpense[] {
  const [from, to] = monthRange(month);
  const lastDay = Number(to.slice(8, 10));
  const daily = new Map<number, number>();

  for (let day = 1; day <= lastDay; day += 1) {
    daily.set(day, 0);
  }

  for (const entry of entries) {
    const kind = readFinanceKind(entry);
    if (kind !== "expense") {
      continue;
    }

    const date = getString(entry.metadata.transaction_date, entry.updated_at.slice(0, 10));
    if (date < from || date > to) {
      continue;
    }

    const day = Number(date.slice(8, 10));
    if (!Number.isFinite(day) || day < 1 || day > lastDay) {
      continue;
    }

    daily.set(day, (daily.get(day) ?? 0) + getNumber(entry.metadata.amount));
  }

  return Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    return {
      day,
      total: daily.get(day) ?? 0,
      label: String(day),
    };
  });
}

export function collapseSmallCategories(
  items: Array<{ category: string; total: number }>,
  total: number,
  minSharePercent = 3,
): FinanceCategoryItem[] {
  if (items.length === 0 || total <= 0) {
    return items.map((item) => ({ category: item.category, total: item.total }));
  }

  const threshold = total * (minSharePercent / 100);
  const main: FinanceCategoryItem[] = [];
  const collapsed: Array<{ category: string; total: number }> = [];

  for (const item of items) {
    if (item.total < threshold) {
      collapsed.push(item);
    } else {
      main.push({ category: item.category, total: item.total });
    }
  }

  if (collapsed.length === 0) {
    return main;
  }

  const collapsedTotal = collapsed.reduce((sum, item) => sum + item.total, 0);
  const sourceCategories = collapsed.map((item) => item.category);
  const existingOther = main.find((item) => item.category === "Прочее");

  if (existingOther) {
    existingOther.total += collapsedTotal;
    existingOther.sourceCategories = [...(existingOther.sourceCategories ?? ["Прочее"]), ...sourceCategories];
  } else {
    main.push({
      category: "Прочее",
      total: collapsedTotal,
      sourceCategories,
    });
  }

  return main.sort((left, right) => right.total - left.total);
}

export function categoryMatchesSelection(
  category: string,
  selectedCategory: string,
  sourceCategories?: string[],
): boolean {
  if (category === selectedCategory) {
    return true;
  }
  if (selectedCategory === "Прочее" && sourceCategories?.includes(category)) {
    return true;
  }
  return false;
}

export function resolveCompareTotal(
  category: string,
  compareMap: Map<string, number>,
  sourceCategories?: string[],
): number {
  if (category === "Прочее" && sourceCategories && sourceCategories.length > 0) {
    return sourceCategories.reduce((sum, name) => sum + (compareMap.get(name) ?? 0), 0);
  }
  return compareMap.get(category) ?? 0;
}
