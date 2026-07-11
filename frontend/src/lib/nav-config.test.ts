import { describe, expect, it } from "vitest";

import {
  DEFAULT_NAV_ORDER,
  reorderNavItems,
  sanitizeNavOrder,
} from "@/lib/nav-config";

describe("nav-config", () => {
  it("keeps unknown ids out and appends missing defaults", () => {
    expect(sanitizeNavOrder(["inbox", "unknown", "board"])).toEqual([
      "inbox",
      "board",
      "dashboard",
      "notes",
      "articles",
      "plans",
      "tracking-habits",
      "tracking-finance",
      "tracking-food",
      "tracking-workouts",
      "transcription",
      "therapy-sessions",
      "assistant",
      "reference",
    ]);
  });

  it("reorders items by id", () => {
    const next = reorderNavItems(DEFAULT_NAV_ORDER, "reference", "dashboard");
    expect(next[0]).toBe("reference");
    expect(next).toContain("dashboard");
    expect(next).toHaveLength(DEFAULT_NAV_ORDER.length);
  });
});
