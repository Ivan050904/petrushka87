import { describe, expect, it } from "vitest";

import {
  ARTICLE_DATE_GROUP_LABELS,
  getArticleDateGroup,
  groupArticlesByDate,
} from "@/features/articles/articles-helpers";
import type { Entry } from "@/lib/types";

function makeArticle(id: string, discoveredAt: string): Entry {
  return {
    id,
    type: "resource",
    title: id,
    content: "",
    metadata: { discovered_at: discoveredAt },
    created_at: discoveredAt,
    updated_at: discoveredAt,
  };
}

describe("groupArticlesByDate", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");

  it("groups articles into today, yesterday, this week, earlier", () => {
    const entries = [
      makeArticle("today", "2026-07-12T08:00:00.000Z"),
      makeArticle("yesterday", "2026-07-11T08:00:00.000Z"),
      makeArticle("week", "2026-07-09T08:00:00.000Z"),
      makeArticle("earlier", "2026-06-01T08:00:00.000Z"),
    ];

    expect(getArticleDateGroup(entries[0], now)).toBe("today");
    expect(getArticleDateGroup(entries[1], now)).toBe("yesterday");
    expect(getArticleDateGroup(entries[2], now)).toBe("this_week");
    expect(getArticleDateGroup(entries[3], now)).toBe("earlier");

    const grouped = groupArticlesByDate(entries, now);
    expect(grouped.map((section) => section.label)).toEqual([
      ARTICLE_DATE_GROUP_LABELS.today,
      ARTICLE_DATE_GROUP_LABELS.yesterday,
      ARTICLE_DATE_GROUP_LABELS.this_week,
      ARTICLE_DATE_GROUP_LABELS.earlier,
    ]);
  });
});
