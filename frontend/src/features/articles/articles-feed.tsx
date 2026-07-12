"use client";

import { ArticleCard } from "@/features/articles/article-card";
import { groupArticlesByDate, type ArticlesTab } from "@/features/articles/articles-helpers";
import type { ArticleFeedbackType } from "@/lib/api";
import type { Entry } from "@/lib/types";

type ArticlesFeedProps = {
  articles: Entry[];
  tab: ArticlesTab;
  feedbackPendingId: string | null;
  onFeedback: (entryId: string, feedback: ArticleFeedbackType) => void;
};

export function ArticlesFeed({ articles, tab, feedbackPendingId, onFeedback }: ArticlesFeedProps) {
  const sections = groupArticlesByDate(articles);

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.group}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--articles-muted)]">
            {section.label}
          </h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {section.entries.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                tab={tab}
                isPending={feedbackPendingId === article.id}
                onFeedback={onFeedback}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
