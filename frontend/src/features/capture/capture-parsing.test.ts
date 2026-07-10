import { describe, expect, it } from "vitest";

import type { QuickCaptureEntryType } from "@/features/capture/capture-entry-types";
import { shouldSuggestAi } from "@/features/capture/capture-ai-suggest";
import { detectCaptureType } from "@/features/capture/capture-type-detector";
import { parseFinanceLine, scoreFinanceDraft } from "@/features/capture/finance-draft-parser";
import { hasFoodMacros, parseFoodLine, scoreFoodDraft } from "@/features/capture/food-draft-parser";
import { buildCapturePayloads, taskDraftToPayload } from "@/features/capture/quick-capture-helpers";
import { parseQuickTasks } from "@/features/capture/task-draft-parser";

type TypeCase = {
  input: string;
  expected: QuickCaptureEntryType;
  note?: string;
};

const TYPE_CASES: TypeCase[] = [
  // --- задачи ---
  { input: "завтра в 18:00 созвон с Анной", expected: "task" },
  { input: "позвонить маме завтра", expected: "task" },
  { input: "купить хлеб завтра", expected: "task" },
  { input: "через 2 часа созвон", expected: "task" },
  { input: "напомнить про отчёт", expected: "task" },
  { input: "до пятницы сдать отчёт", expected: "task" },
  { input: "#задача купить молоко", expected: "task" },
  { input: "- позвонить в банк\n- отправить документы", expected: "task" },

  // --- финансы ---
  { input: "500 руб кофе", expected: "finance" },
  { input: "кофе — 500", expected: "finance" },
  { input: "кофе за 500", expected: "finance" },
  { input: "₽350 обед", expected: "finance" },
  { input: "+15000 зарплата", expected: "finance" },
  { input: "1.5k такси", expected: "finance" },
  { input: "расход 1 500 продукты", expected: "finance" },
  { input: "#финансы 500 такси", expected: "finance" },
  { input: "купить хлеб 500р", expected: "finance", note: "сумма важнее глагола «купить»" },

  // --- питание ---
  { input: "овсянка 50г б45 ж8 у30", expected: "food" },
  { input: "б45ж8у30", expected: "food" },
  { input: "завтрак: яичница 350 ккал", expected: "food" },
  { input: "обед курица бжу 45/8/30", expected: "food" },
  { input: "ужин лосось 45-8-0", expected: "food" },
  { input: "#еда овсянка 40/5/30", expected: "food" },

  // --- заметки ---
  { input: "идея для проекта", expected: "note" },
  { input: "ссылка на статью про продуктивность", expected: "note" },
  { input: "мысли после встречи", expected: "note" },
  { input: "#заметка сохранить это", expected: "note" },
];

/** Пары «похожий ввод → разный тип»: главная проверка на взаимное влияние. */
const CROSS_TYPE_PAIRS: Array<{ a: TypeCase; b: TypeCase }> = [
  {
    a: { input: "завтра в 18:00 созвон", expected: "task" },
    b: { input: "500 руб кофе", expected: "finance" },
  },
  {
    a: { input: "купить хлеб завтра", expected: "task" },
    b: { input: "купить хлеб 500р", expected: "finance" },
  },
  {
    a: { input: "овсянка 50г б45 ж8 у30", expected: "food" },
    b: { input: "1 500 руб продукты", expected: "finance" },
  },
  {
    a: { input: "завтрак: овсянка 350 ккал", expected: "food" },
    b: { input: "завтра в 9:00 завтрак с клиентом", expected: "task" },
  },
  {
    a: { input: "позвонить маме", expected: "task" },
    b: { input: "получил 5000 от мамы", expected: "finance" },
  },
  {
    a: { input: "идея для проекта", expected: "note" },
    b: { input: "сделать презентацию завтра", expected: "task" },
  },
];

describe("detectCaptureType", () => {
  it.each(TYPE_CASES)("$expected ← $input", ({ input, expected }) => {
    expect(detectCaptureType(input)).toBe(expected);
  });

  describe("cross-type isolation", () => {
    it.each(CROSS_TYPE_PAIRS)("$a.input vs $b.input", ({ a, b }) => {
      expect(detectCaptureType(a.input)).toBe(a.expected);
      expect(detectCaptureType(b.input)).toBe(b.expected);
      expect(detectCaptureType(a.input)).not.toBe(detectCaptureType(b.input));
    });
  });

  it("does not treat task time as finance amount", () => {
    expect(detectCaptureType("созвон в 18:00")).toBe("task");
    expect(scoreFinanceDraft(parseFinanceLine("созвон в 18:00"))).toBeLessThan(5);
  });

  it("does not treat food macros as finance", () => {
    expect(detectCaptureType("курица 45/8/30")).toBe("food");
    expect(scoreFinanceDraft(parseFinanceLine("курица 45/8/30"))).toBeLessThan(
      scoreFoodDraft(parseFoodLine("курица 45/8/30")),
    );
  });

  it("does not treat bare action verbs as finance", () => {
    expect(detectCaptureType("купить")).toBe("task");
    expect(detectCaptureType("позвонить")).toBe("task");
    expect(scoreFinanceDraft(parseFinanceLine("купить"))).toBeLessThan(5);
    expect(scoreFinanceDraft(parseFinanceLine("позвонить"))).toBeLessThan(5);
  });

  it("does not treat meal words in tasks as food", () => {
    expect(detectCaptureType("завтра в 9:00 завтрак с клиентом")).toBe("task");
    expect(detectCaptureType("завтрак: овсянка 350 ккал")).toBe("food");
  });
});

describe("parseFinanceLine", () => {
  it("parses common formats", () => {
    expect(parseFinanceLine("500 руб кофе")).toMatchObject({
      amount: 500,
      currency: "RUB",
      direction: "expense",
      description: "кофе",
    });
    expect(parseFinanceLine("кофе — 1 500")).toMatchObject({
      amount: 1500,
      description: "кофе",
    });
    expect(parseFinanceLine("+15000 зарплата")).toMatchObject({
      amount: 15000,
      direction: "income",
      description: "зарплата",
    });
    expect(parseFinanceLine("1.5k такси")).toMatchObject({
      amount: 1500,
      description: "такси",
    });
  });

  it("strips explicit finance marker from description", () => {
    expect(parseFinanceLine("#финансы 500 такси").description).toBe("такси");
  });

  it("ignores clock time in task-like phrases", () => {
    const draft = parseFinanceLine("созвон в 18:00");
    expect(draft.amount).toBe(0);
  });
});

describe("parseFoodLine", () => {
  it("parses macro formats", () => {
    expect(parseFoodLine("овсянка 50г б45 ж8 у30")).toMatchObject({
      title: "овсянка",
      grams: 50,
      protein: 45,
      fat: 8,
      carbs: 30,
    });
    expect(parseFoodLine("б45ж8у30")).toMatchObject({
      protein: 45,
      fat: 8,
      carbs: 30,
    });
    expect(parseFoodLine("обед курица бжу 45/8/30")).toMatchObject({
      title: "Обед: курица",
      protein: 45,
      fat: 8,
      carbs: 30,
    });
  });

  it("strips explicit food marker from title", () => {
    expect(parseFoodLine("#еда овсянка 40/5/30").title.toLowerCase()).toContain("овсянка");
    expect(parseFoodLine("#еда овсянка 40/5/30").title.toLowerCase()).not.toContain("#еда");
  });

  it("does not confuse finance amounts with macros", () => {
    const draft = parseFoodLine("500 руб кофе");
    expect(hasFoodMacros(draft)).toBe(false);
    expect(scoreFoodDraft(draft)).toBeLessThan(3);
  });
});

describe("parseQuickTasks", () => {
  it("parses schedule without finance bleed", () => {
    const [draft] = parseQuickTasks("завтра в 18:00 созвон");
    expect(draft.title.toLowerCase()).toContain("созвон");
    expect(draft.scheduledAt).toMatch(/T18:00/);
    expect(draft.recognizedTokens.length).toBeGreaterThan(0);
  });

  it("does not treat plain finance line as scheduled task", () => {
    const [draft] = parseQuickTasks("500 руб кофе");
    expect(draft.scheduledAt).toBe("");
    expect(draft.deadline).toBe("");
  });

  it("parses deadline, priority, tags and assignee", () => {
    const [draft] = parseQuickTasks("до пятницы !!! #работа позвонить @anna");
    expect(draft.deadline).toMatch(/T\d{2}:\d{2}/);
    expect(draft.priority).toBe("urgent");
    expect(draft.tags).toContain("работа");
    expect(draft.assigneeName).toBe("anna");
    expect(draft.title.toLowerCase()).toContain("позвонить");
  });

  it("parses duration", () => {
    const [draft] = parseQuickTasks("созвон 30 мин");
    expect(draft.plannedDurationMinutes).toBe("30");
  });

  it("splits multiple task lines", () => {
    const drafts = parseQuickTasks("- позвонить в банк\n- отправить документы");
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.title.toLowerCase()).toContain("банк");
    expect(drafts[1]?.title.toLowerCase()).toContain("документ");
  });
});

describe("taskDraftToPayload", () => {
  it("maps core task fields into entry metadata", () => {
    const [draft] = parseQuickTasks("завтра в 10:00 #личное созвон 45 мин");
    const payload = taskDraftToPayload(draft);
    expect(payload.type).toBe("task");
    expect(payload.metadata.scheduled_at).toMatch(/T10:00/);
    expect(payload.metadata.planned_duration_minutes).toBe(45);
    expect(payload.metadata.tags).toContain("личное");
    expect(payload.metadata.source).toBe("dashboard_quick_input");
  });
});

describe("shouldSuggestAi", () => {
  it("does not suggest for empty or short confident parses", () => {
    expect(shouldSuggestAi("", "auto")).toBe(false);
    expect(shouldSuggestAi("500 руб кофе", "finance")).toBe(false);
    expect(shouldSuggestAi("завтра в 18:00 созвон", "auto")).toBe(false);
  });

  it("suggests for long or ambiguous auto input", () => {
    expect(shouldSuggestAi("a".repeat(120), "auto")).toBe(true);
    expect(
      shouldSuggestAi(
        "нужно разобраться с длинным списком дел и понять что из этого задача а что заметка",
        "auto",
      ),
    ).toBe(true);
  });
});

describe("buildCapturePayloads", () => {
  it.each(TYPE_CASES.filter((item) => item.expected !== "note"))(
    "builds payload for $expected: $input",
    ({ input, expected }) => {
      const result = buildCapturePayloads("auto", input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.effectiveType).toBe(expected);
        expect(result.payloads.length).toBeGreaterThan(0);
        expect(result.payloads[0]?.type).toBe(expected);
      }
    },
  );

  it("respects explicit user type over auto detection", () => {
    const result = buildCapturePayloads("note", "500 руб кофе");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.effectiveType).toBe("note");
      expect(result.payloads[0]?.type).toBe("note");
    }
  });

  it("rejects finance without amount even when type forced", () => {
    const result = buildCapturePayloads("finance", "просто текст");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.effectiveType).toBe("finance");
    }
  });

  it("rejects food without macros even when type forced", () => {
    const result = buildCapturePayloads("food", "завтрак овсянка");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.effectiveType).toBe("food");
    }
  });

  it("builds note payloads in auto mode", () => {
    const result = buildCapturePayloads("auto", "идея для проекта");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.effectiveType).toBe("note");
      expect(result.payloads[0]?.type).toBe("note");
      expect(result.payloads[0]?.content).toBe("идея для проекта");
    }
  });

  it("maps finance fields into entry metadata", () => {
    const result = buildCapturePayloads("auto", "+15000 зарплата");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const payload = result.payloads[0];
      expect(payload?.type).toBe("finance");
      if (payload?.type === "finance") {
        expect(payload.metadata.amount).toBe(15000);
        expect(payload.metadata.direction).toBe("income");
      }
    }
  });
});
