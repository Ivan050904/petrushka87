"use client";

import { Ban, ExternalLink, ThumbsDown } from "lucide-react";

import type { ArticleFeedbackType } from "@/lib/api";
import type { Entry } from "@/lib/types";
import {
  getArticleMetaParts,
  getArticleQuery,
  getArticleSummary,
  getArticleTier,
  getArticleUrl,
  getDisplayTitle,
  getFaviconUrl,
  getHostname,
  getSourceSite,
  TIER_LABELS,
  type ArticlesTab,
  type PsychTierFilter,
} from "@/features/articles/articles-helpers";
import { cn } from "@/lib/utils";

type ArticleCardProps = {
  article: Entry;
  tab: ArticlesTab;
  isPending?: boolean;
  onFeedback: (entryId: string, feedback: ArticleFeedbackType) => void;
};

export function ArticleCard({ article, tab, isPending, onFeedback }: ArticleCardProps) {
  const url = getArticleUrl(article);
  const topic = getArticleQuery(article);
  const tier = getArticleTier(article);
  const sourceSite = getSourceSite(article);
  const hostname = getHostname(url) || sourceSite;
  const faviconUrl = getFaviconUrl(url);
  const metaParts = getArticleMetaParts(article, tab);
  const readLabel = tab === "psychology" ? "Читать (EN)" : "Читать";

  return (
    <article className={cn("articles-card flex flex-col p-4", isPending && "articles-card-pending")}>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--articles-border)] bg-[var(--articles-bg)]">
          {faviconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={faviconUrl} alt="" width={20} height={20} className="size-5" />
          ) : (
            <span className="text-xs font-semibold uppercase text-[var(--articles-muted)]">
              {hostname.slice(0, 1) || "?"}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {hostname ? (
              <span className="text-xs font-medium text-[var(--articles-muted)]">{hostname}</span>
            ) : null}
            {tab === "psychology" && tier && tier in TIER_LABELS ? (
              <span className="articles-topic-pill">{TIER_LABELS[tier as Exclude<PsychTierFilter, "all">]}</span>
            ) : null}
            {topic ? <span className="articles-topic-pill">{topic}</span> : null}
          </div>
          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--articles-foreground)]">
            {getDisplayTitle(article, tab)}
          </h2>
        </div>
      </div>

      {metaParts.length > 0 ? (
        <p className="mb-2 text-xs text-[var(--articles-muted)]">{metaParts.join(" · ")}</p>
      ) : null}

      <p className="mb-4 line-clamp-2 flex-1 text-sm leading-relaxed text-[var(--articles-muted)]">
        {getArticleSummary(article, tab)}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="articles-btn-primary focus-ring inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            {readLabel}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
        <button
          type="button"
          disabled={isPending}
          title="Статья в теме, но не интересна — скрыть и не предлагать похожие"
          aria-label="Не нравится"
          onClick={() => onFeedback(article.id, "dislike")}
          className="articles-btn-ghost focus-ring inline-flex size-11 items-center justify-center rounded-md"
        >
          <ThumbsDown className="size-4" />
        </button>
        <button
          type="button"
          disabled={isPending}
          title={
            tab === "psychology"
              ? "Не про CBT и когнитивные искажения — скрыть и не предлагать похожие темы"
              : "Не про ИИ-агентов и инструменты — скрыть и не предлагать похожие темы"
          }
          aria-label="Не в тему"
          onClick={() => onFeedback(article.id, "off_topic")}
          className="articles-btn-ghost focus-ring inline-flex size-11 items-center justify-center rounded-md"
        >
          <Ban className="size-4" />
        </button>
      </div>
    </article>
  );
}
