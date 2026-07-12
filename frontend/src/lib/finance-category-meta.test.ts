import { describe, expect, it } from "vitest";

import { computeKpiDeltaMeta } from "@/lib/finance-category-meta";

describe("computeKpiDeltaMeta", () => {
  it("marks expense increase as bad", () => {
    expect(computeKpiDeltaMeta("expense", 120, 100)).toEqual({ label: "+20%", sentiment: "bad" });
  });

  it("marks expense decrease as good", () => {
    expect(computeKpiDeltaMeta("expense", 80, 100)).toEqual({ label: "-20%", sentiment: "good" });
  });

  it("marks income increase as good", () => {
    expect(computeKpiDeltaMeta("income", 120, 100)).toEqual({ label: "+20%", sentiment: "good" });
  });

  it("marks balance decrease as bad", () => {
    expect(computeKpiDeltaMeta("balance", 80, 100)).toEqual({ label: "-20%", sentiment: "bad" });
  });

  it("returns neutral when compare is zero", () => {
    expect(computeKpiDeltaMeta("income", 100, 0)).toEqual({ label: null, sentiment: "neutral" });
  });
});
