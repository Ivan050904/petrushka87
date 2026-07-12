import { describe, expect, it } from "vitest";

import {
  aggregateDailyExpenses,
  aggregateMonthlyTotals,
  buildCompareMap,
  categoryMatchesSelection,
  collapseSmallCategories,
  monthKeyFromEntry,
  resolveCompareTotal,
} from "@/lib/finance-aggregates";
import type { Entry } from "@/lib/types";

function financeEntry(overrides: Partial<Entry> & { metadata: Record<string, unknown> }): Entry {
  return {
    id: overrides.id ?? "1",
    type: "finance",
    title: overrides.title ?? "Test",
    content: overrides.content ?? "",
    created_at: overrides.created_at ?? "2026-06-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-06-01T00:00:00Z",
    metadata: overrides.metadata,
  };
}

describe("finance-aggregates", () => {
  it("derives month key from transaction_date", () => {
    const entry = financeEntry({ metadata: { transaction_date: "2026-06-15" } });
    expect(monthKeyFromEntry(entry)).toBe("2026-06");
  });

  it("aggregates monthly totals and skips transfers", () => {
    const entries = [
      financeEntry({ id: "1", metadata: { kind: "income", amount: 1000, transaction_date: "2026-06-05" } }),
      financeEntry({ id: "2", metadata: { kind: "expense", amount: 400, transaction_date: "2026-06-10" } }),
      financeEntry({ id: "3", metadata: { kind: "transfer", amount: 200, transaction_date: "2026-06-11" } }),
      financeEntry({ id: "4", metadata: { kind: "expense", amount: 100, transaction_date: "2026-05-20" } }),
    ];

    const result = aggregateMonthlyTotals(entries, ["2026-05", "2026-06"]);
    expect(result).toEqual([
      { month: "2026-05", income: 0, expense: 100, balance: -100 },
      { month: "2026-06", income: 1000, expense: 400, balance: 600 },
    ]);
  });

  it("aggregates daily expenses for month", () => {
    const entries = [
      financeEntry({ id: "1", metadata: { kind: "expense", amount: 50, transaction_date: "2026-06-01" } }),
      financeEntry({ id: "2", metadata: { kind: "expense", amount: 30, transaction_date: "2026-06-01" } }),
      financeEntry({ id: "3", metadata: { kind: "income", amount: 100, transaction_date: "2026-06-02" } }),
      financeEntry({ id: "4", metadata: { kind: "expense", amount: 10, transaction_date: "2026-06-03" } }),
    ];

    const result = aggregateDailyExpenses(entries, "2026-06");
    expect(result[0]).toEqual({ day: 1, total: 80, label: "1" });
    expect(result[1]).toEqual({ day: 2, total: 0, label: "2" });
    expect(result[2]).toEqual({ day: 3, total: 10, label: "3" });
    expect(result).toHaveLength(30);
  });

  it("collapses categories below share threshold into Прочее", () => {
    const items = [
      { category: "магазин", total: 500 },
      { category: "кэшбэк", total: 10 },
      { category: "стипендия", total: 10 },
    ];
    const collapsed = collapseSmallCategories(items, 520, 3);

    expect(collapsed).toHaveLength(2);
    expect(collapsed[0]).toMatchObject({ category: "магазин", total: 500 });
    expect(collapsed[1]).toMatchObject({
      category: "Прочее",
      total: 20,
      sourceCategories: ["кэшбэк", "стипендия"],
    });
  });

  it("buildCompareMap and resolveCompareTotal sum collapsed categories", () => {
    const map = buildCompareMap([
      { category: "кэшбэк", total: 5 },
      { category: "стипендия", total: 15 },
    ]);
    expect(resolveCompareTotal("Прочее", map, ["кэшбэк", "стипендия"])).toBe(20);
  });

  it("categoryMatchesSelection handles collapsed Прочее", () => {
    expect(categoryMatchesSelection("кэшбэк", "Прочее", ["кэшбэк", "стипендия"])).toBe(true);
    expect(categoryMatchesSelection("магазин", "Прочее", ["кэшбэк"])).toBe(false);
  });
});
