import { describe, expect, it } from "vitest";

import {
  buildTransactionFingerprint,
  isDuplicateImportRow,
  normalizeFinanceDescription,
} from "@/lib/finance-dedup";

describe("finance-dedup", () => {
  it("normalizes card masks and auth codes", () => {
    expect(normalizeFinanceDescription("Стипендия. Операция по карте ****3295 678601")).toBe("стипендия.");
  });

  it("builds stable fingerprints", async () => {
    const first = await buildTransactionFingerprint({
      bank: "sber",
      accountId: "acc-1",
      transactionDate: "2026-07-05",
      amount: 3000,
      description: "Стипендия учащимся",
    });
    const second = await buildTransactionFingerprint({
      bank: "sber",
      accountId: "acc-1",
      transactionDate: "2026-07-05",
      amount: 3000,
      description: "стипендия учащимся",
    });
    expect(first).toBe(second);
    expect(first).toHaveLength(32);
    expect(first).toBe("e1f738aba9297aaeddfc84972d724adf");
  });

  it("detects duplicates by fingerprint even with different external_id", async () => {
    const fingerprint = await buildTransactionFingerprint({
      bank: "sber",
      accountId: "acc-1",
      transactionDate: "2026-07-05",
      amount: 3000,
      description: "Стипендия",
    });
    const isDuplicate = isDuplicateImportRow({ external_id: "legacy-hash" }, fingerprint, {
      externalIds: new Set(["legacy-hash"]),
      fingerprints: new Set([fingerprint]),
    });
    expect(isDuplicate).toBe(true);
  });

  it("treats overlapping imports as duplicates via fingerprint", async () => {
    const fingerprint = await buildTransactionFingerprint({
      bank: "sber",
      accountId: "acc-1",
      transactionDate: "2026-07-03",
      amount: 1500,
      description: "Пятёрочка",
    });
    const fromWiderExport = isDuplicateImportRow({ external_id: fingerprint }, fingerprint, {
      externalIds: new Set(),
      fingerprints: new Set([fingerprint]),
    });
    expect(fromWiderExport).toBe(true);
  });
});
