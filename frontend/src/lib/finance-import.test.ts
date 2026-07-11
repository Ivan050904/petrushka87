import { describe, expect, it } from "vitest";

import {
  DEFAULT_FINANCE_CATEGORIES,
  FINANCE_BANK_OPTIONS,
  FINANCE_SETTINGS_STORAGE_KEY,
  createFinanceAccountId,
} from "@/lib/finance-import";

describe("finance-import helpers", () => {
  it("lists all supported bank codes", () => {
    const values = FINANCE_BANK_OPTIONS.map((option) => option.value);
    expect(values).toContain("tinkoff");
    expect(values).toContain("generic");
  });

  it("keeps default categories non-empty", () => {
    expect(DEFAULT_FINANCE_CATEGORIES.length).toBeGreaterThan(3);
    expect(DEFAULT_FINANCE_CATEGORIES).toContain("Прочее");
  });

  it("uses per-user storage key prefix", () => {
    expect(FINANCE_SETTINGS_STORAGE_KEY).toBe("folio_one_finance_settings");
  });

  it("creates account ids", () => {
    const id = createFinanceAccountId();
    expect(id.length).toBeGreaterThan(5);
  });
});
