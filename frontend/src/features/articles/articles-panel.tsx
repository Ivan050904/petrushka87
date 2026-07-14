"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Newspaper, RefreshCw } from "lucide-react";

import { ArticleCardSkeleton } from "@/features/articles/article-card-skeleton";
import { ArticlesDigestStatus } from "@/features/articles/articles-digest-status";
import { ArticlesFeed } from "@/features/articles/articles-feed";
import { ArticlesFilterBar } from "@/features/articles/articles-filter-bar";
import { ArticlesToolbar } from "@/features/articles/articles-toolbar";
import { getArticlesEmptyState } from "@/features/articles/articles-empty-state";
import {
  getArticleQuery,
  getArticleSummary,
  getArticleTier,
  getArticleUrl,
  getDisplayTitle,
  isAccessChecked,
  type ArticlesTab,
  type PsychTierFilter,
} from "@/features/articles/articles-helpers";
import { SegmentTabs } from "@/components/ui/segment-tabs";
import { Notice } from "@/components/ui/notice";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  getDigestStatus,
  getErrorMessage,
  listEntries,
  runDigest,
  submitArticleFeedback,
  tuneAiQueries,
  tunePsychQueries,
  type ArticleFeedbackType,
  type DigestProfileStatus,
  type DigestStatus,
} from "@/lib/api";
import type { Entry } from "@/lib/types";

const PAGE_SIZE = 200;

function profileStatus(status: DigestStatus | null, tab: ArticlesTab): DigestProfileStatus | null {
  if (!status) {
    return null;
  }
  return tab === "psychology" ? status.psychology : status;
}

function ArticlesEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: "ai" | "psychology";
}) {
  return (
    <div
      role="status"
      className="articles-empty-state flex flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      {icon === "psychology" ? (
        <Brain className="size-10 text-[var(--articles-accent)]" aria-hidden="true" />
      ) : (
        <Newspaper className="size-10 text-[var(--articles-accent)]" aria-hidden="true" />
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-[var(--articles-foreground)]">{title}</h3>
        {description ? <p className="text-xs text-[var(--articles-muted)]">{description}</p> : null}
      </div>
      {onAction && actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="articles-btn-primary focus-ring inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm font-medium"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ArticlesPanel() {
  const { token } = useRequireAuth();
  const [tab, setTab] = useState<ArticlesTab>("ai");
  const [articles, setArticles] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<DigestStatus | null>(null);
  const [query, setQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<PsychTierFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isTuning, setIsTuning] = useState(false);
  const [feedbackPendingId, setFeedbackPendingId] = useState<string | null>(null);

  const loadArticles = useCallback(
    async (options?: { append?: boolean; offset?: number; activeTab?: ArticlesTab }) => {
      if (!token) {
        return;
      }

      const activeTab = options?.activeTab ?? tab;
      const append = options?.append ?? false;
      const offset = options?.offset ?? 0;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setLoadError(null);

      try {
        const entriesPromise = listEntries(token, {
          type: "resource",
          kind: "article",
          limit: PAGE_SIZE,
          offset,
          sort: "discovered_at_desc",
          exclude_hidden: true,
          ...(activeTab === "psychology"
            ? { collection: "psychology" }
            : { exclude_collection: "psychology" }),
        });
        const [entriesResult, digestStatus] = await Promise.all([
          entriesPromise,
          append ? Promise.resolve(null) : getDigestStatus(token),
        ]);

        setArticles((current) =>
          append ? [...current, ...entriesResult.items] : entriesResult.items,
        );
        setTotal(entriesResult.total);
        if (digestStatus) {
          setStatus(digestStatus);
        }
      } catch (requestError) {
        setLoadError(getErrorMessage(requestError, "Не удалось загрузить статьи."));
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [tab, token],
  );

  useEffect(() => {
    setQuery("");
    setTopicFilter("all");
    setTierFilter("all");
    setActionInfo(null);
    setActionError(null);
    void loadArticles({ activeTab: tab });
  }, [tab, loadArticles]);

  const topicOptions = useMemo(() => {
    const topics = new Set<string>();
    for (const article of articles) {
      const topic = getArticleQuery(article);
      if (topic) {
        topics.add(topic);
      }
    }
    return ["all", ...Array.from(topics).sort((a, b) => a.localeCompare(b, "ru"))];
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return articles.filter((article) => {
      const topic = getArticleQuery(article);
      if (topicFilter !== "all" && topic !== topicFilter) {
        return false;
      }
      if (tab === "psychology" && tierFilter !== "all") {
        if (getArticleTier(article) !== tierFilter) {
          return false;
        }
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        getDisplayTitle(article, tab),
        article.content,
        getArticleSummary(article, tab),
        topic,
        getArticleUrl(article),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [articles, query, tab, tierFilter, topicFilter]);

  const hasMore = articles.length < total;
  const currentProfileStatus = profileStatus(status, tab);
  const checkedLinks = useMemo(
    () => (tab === "psychology" ? articles.filter(isAccessChecked).length : 0),
    [articles, tab],
  );

  async function handleRunDigest() {
    if (!token) {
      return;
    }

    setIsRunning(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const result = await runDigest(token, { force: true, profile: tab });
      await loadArticles({ activeTab: tab });
      if (result.articles_saved > 0) {
        setActionInfo(`Добавлено статей: ${result.articles_saved}`);
      } else if (result.status === "up_to_date") {
        setActionInfo("Дайджест уже актуален на сегодня — новых статей не добавлено.");
      } else {
        setActionInfo(
          "Новых статей не найдено: все результаты поиска уже есть в списке или отфильтрованы.",
        );
      }
    } catch (requestError) {
      setActionError(
        getErrorMessage(
          requestError,
          tab === "psychology" ? "Не удалось найти статьи." : "Не удалось запустить дайджест.",
        ),
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function handleTuneQueries() {
    if (!token) {
      return;
    }

    setIsTuning(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const result =
        tab === "psychology" ? await tunePsychQueries(token) : await tuneAiQueries(token);
      const digestStatus = await getDigestStatus(token);
      setStatus(digestStatus);
      setActionInfo(result.message);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось обновить запросы поиска."));
    } finally {
      setIsTuning(false);
    }
  }

  async function handleFeedback(entryId: string, feedback: ArticleFeedbackType) {
    if (!token) {
      return;
    }

    setFeedbackPendingId(entryId);
    setActionError(null);
    setArticles((current) => current.filter((article) => article.id !== entryId));
    setTotal((current) => Math.max(0, current - 1));

    try {
      await submitArticleFeedback(token, entryId, feedback);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось сохранить отзыв."));
      await loadArticles({ activeTab: tab });
    } finally {
      setFeedbackPendingId(null);
    }
  }

  const hasActiveFilter =
    topicFilter !== "all" || query.trim().length > 0 || (tab === "psychology" && tierFilter !== "all");

  const runButtonLabel = tab === "psychology" ? "Найти сейчас" : "Запустить дайджест сейчас";
  const emptyTitle =
    tab === "psychology"
      ? "Психологических статей пока нет. Нажмите «Найти сейчас» или дождитесь утреннего автозапуска."
      : "Статей пока нет. Запустите дайджест вручную или дождитесь утреннего автозапуска.";
  const emptyActionLabel = tab === "psychology" ? "Найти сейчас" : "Запустить дайджест";

  function resetFilters() {
    setQuery("");
    setTopicFilter("all");
    setTierFilter("all");
  }

  const emptyStateKind = getArticlesEmptyState({
    isLoading,
    articlesCount: articles.length,
    filteredCount: filteredArticles.length,
    hasActiveFilter,
  });

  return (
    <div className="articles-surface flex min-h-0 flex-1 flex-col" data-tab={tab}>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-4 lg:px-6 lg:py-6">
        <ArticlesToolbar
          tab={tab}
          isRunning={isRunning}
          isTuning={isTuning}
          runButtonLabel={runButtonLabel}
          onRunDigest={() => void handleRunDigest()}
          onTuneQueries={() => void handleTuneQueries()}
        />

        <SegmentTabs
          value={tab}
          onChange={setTab}
          className="grid-cols-2 sm:max-w-xs"
          options={[
            { value: "ai", label: "ИИ" },
            { value: "psychology", label: "Психология" },
          ]}
        />

        <ArticlesDigestStatus tab={tab} status={status} profileStatus={currentProfileStatus} />

        {actionInfo ? (
          <Notice variant="info" className="articles-notice">
            {actionInfo}
          </Notice>
        ) : null}
        {actionError ? (
          <Notice variant="error" className="articles-notice">
            {actionError}
          </Notice>
        ) : null}
        {loadError ? (
          <Notice variant="error" className="articles-notice">
            {loadError}
          </Notice>
        ) : null}

        <ArticlesFilterBar
          tab={tab}
          query={query}
          onQueryChange={setQuery}
          topicFilter={topicFilter}
          onTopicChange={setTopicFilter}
          topicOptions={topicOptions}
          tierFilter={tierFilter}
          onTierChange={setTierFilter}
        />

        {!isLoading && total > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--articles-muted)]">
            <span>
              {hasActiveFilter
                ? `Показано ${filteredArticles.length} из ${articles.length} загруженных · всего ${total}`
                : `Показано ${filteredArticles.length} из ${total}`}
            </span>
            {tab === "psychology" ? <span>Проверено доступных ссылок: {checkedLinks}</span> : null}
          </div>
        ) : null}

        {emptyStateKind === "loading" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <ArticleCardSkeleton key={index} />
            ))}
          </div>
        ) : emptyStateKind === "filtered-empty" ? (
          <ArticlesEmptyState
            icon={tab}
            title="Ничего не найдено"
            description="Попробуйте другой запрос или сбросьте фильтры."
            actionLabel="Сбросить фильтры"
            onAction={resetFilters}
          />
        ) : emptyStateKind === "true-empty" ? (
          <ArticlesEmptyState
            icon={tab}
            title={emptyTitle}
            actionLabel={emptyActionLabel}
            onAction={() => void handleRunDigest()}
          />
        ) : (
          <ArticlesFeed
            articles={filteredArticles}
            tab={tab}
            feedbackPendingId={feedbackPendingId}
            onFeedback={(entryId, feedback) => void handleFeedback(entryId, feedback)}
          />
        )}

        {hasMore && !isLoading ? (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={() => void loadArticles({ append: true, offset: articles.length, activeTab: tab })}
              className="articles-btn-ghost focus-ring inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--articles-border)] px-4 py-2 text-sm font-medium"
            >
              {isLoadingMore ? <RefreshCw className="size-4 animate-spin" /> : null}
              Показать ещё
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
