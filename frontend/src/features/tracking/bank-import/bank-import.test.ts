import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { detectBank } from "@/features/tracking/bank-import/detect-bank";
import { parseBankStatement } from "@/features/tracking/bank-import/registry";
import { suggestCategory } from "@/features/tracking/finance-categories";
import { isTransferByDescription } from "@/features/tracking/bank-import/transfer-detector";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function readFixture(name: string) {
  return readFileSync(join(fixtureDir, name), "utf8");
}

describe("detectBank", () => {
  it("detects alfa bank from header and sample", () => {
    const header = readFixture("alfa-header.txt");
    const sample = readFixture("alfa-sample.txt");
    const result = detectBank(`${header}\n${sample}`, "document10.07.26.pdf");
    expect(result.bank).toBe("alfa");
  });

  it("detects sber bank", () => {
    const result = detectBank(readFixture("sber-sample.txt"), "Выписка по счёту дебетовой карты.pdf");
    expect(result.bank).toBe("sber");
  });
});

describe("bank parsers", () => {
  it("parses alfa card and transfer operations", () => {
    const text = `${readFixture("alfa-header.txt")}\n${readFixture("alfa-sample.txt")}`;
    const rows = parseBankStatement(text, "alfa");
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]?.title).toContain("SPORTMASTER");
    expect(rows[0]?.amount).toBe(3039);
  });

  it("parses sber operations and marks card-to-deposit as transfer", () => {
    const rows = parseBankStatement(readFixture("sber-sample.txt"), "sber");
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.some((row) => row.title.includes("Стипендия"))).toBe(true);
    expect(rows.some((row) => row.suggestedKind === "transfer")).toBe(true);
  });

  it("parses ozon purchase and sbp top-up pair", () => {
    const rows = parseBankStatement(readFixture("ozon-sample.txt"), "ozon");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.suggestedKind === "transfer")).toBe(true);
  });

  it("parses tinkoff operations", () => {
    const rows = parseBankStatement(readFixture("tinkoff-sample.txt"), "tinkoff");
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.title.toLowerCase().includes("перевод"))).toBe(true);
  });

  it("parses yandex operations", () => {
    const rows = parseBankStatement(readFixture("yandex-sample.txt"), "yandex");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((row) => row.suggestedKind === "transfer")).toBe(true);
  });

  it("returns valid ISO transaction dates for all fixture parsers", () => {
    const fixtures: Array<{ name: string; bank: Parameters<typeof parseBankStatement>[1] }> = [
      { name: "alfa-sample.txt", bank: "alfa" },
      { name: "sber-sample.txt", bank: "sber" },
      { name: "ozon-sample.txt", bank: "ozon" },
      { name: "tinkoff-sample.txt", bank: "tinkoff" },
      { name: "yandex-sample.txt", bank: "yandex" },
    ];
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

    for (const fixture of fixtures) {
      const text =
        fixture.bank === "alfa"
          ? `${readFixture("alfa-header.txt")}\n${readFixture(fixture.name)}`
          : readFixture(fixture.name);
      const rows = parseBankStatement(text, fixture.bank);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.date, `${fixture.name}: ${row.title}`).toMatch(isoDatePattern);
        expect(row.date).not.toBe("");
      }
    }
  });
});

describe("transfer and category helpers", () => {
  it("detects transfer phrases", () => {
    expect(isTransferByDescription("Перевод себе")).toBe(true);
    expect(isTransferByDescription("SBERBANK ONL@IN KARTA-VKLAD")).toBe(true);
    expect(isTransferByDescription("Оплата в магазине")).toBe(false);
  });

  it("suggests categories from description", () => {
    expect(suggestCategory({ title: "SPORTMASTER MCC5655" })).toBe("Покупки");
    expect(suggestCategory({ title: "Перевод через СБП" })).toBe("Перевод");
  });
});
