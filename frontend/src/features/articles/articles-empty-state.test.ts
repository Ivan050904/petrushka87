import { describe, expect, it } from "vitest";

import { getArticlesEmptyState } from "@/features/articles/articles-empty-state";

describe("getArticlesEmptyState", () => {
  it("returns loading while fetching", () => {
    expect(
      getArticlesEmptyState({
        isLoading: true,
        articlesCount: 5,
        filteredCount: 0,
        hasActiveFilter: true,
      }),
    ).toBe("loading");
  });

  it("returns content when filtered list has items", () => {
    expect(
      getArticlesEmptyState({
        isLoading: false,
        articlesCount: 5,
        filteredCount: 2,
        hasActiveFilter: true,
      }),
    ).toBe("content");
  });

  it("returns filtered-empty when filters hide existing articles", () => {
    expect(
      getArticlesEmptyState({
        isLoading: false,
        articlesCount: 5,
        filteredCount: 0,
        hasActiveFilter: true,
      }),
    ).toBe("filtered-empty");
  });

  it("returns true-empty when there are no articles at all", () => {
    expect(
      getArticlesEmptyState({
        isLoading: false,
        articlesCount: 0,
        filteredCount: 0,
        hasActiveFilter: false,
      }),
    ).toBe("true-empty");
  });
});
