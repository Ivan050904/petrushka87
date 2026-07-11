"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Ban, Brain, ExternalLink, Newspaper, Play, RefreshCw, Search, ThumbsDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { SegmentTabs } from "@/components/ui/segment-tabs";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  getDigestStatus,
  getErrorMessage,
  listEntries,
  runDigest,
  submitArticleFeedback,
  tunePsychQueries,
  type ArticleFeedbackType,
  type DigestProfileStatus,
  type DigestStatus,
} from "@/lib/api";
import { formatDate, getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";
import { getArticlesEmptyState } from "@/features/articles/articles-empty-state";

const PAGE_SIZE = 200;

type ArticlesTab = "ai" | "psychology";
type PsychTierFilter = "all" | "guides" | "popsci" | "science";

const TIER_LABELS: Record<Exclude<PsychTierFilter, "all">, string> = {
  guides: "Практика",
  popsci: "Научпоп",
  science: "Наука",
};

function getArticleUrl(entry: Entry) {
  return getString(entry.metadata.url);
}

function getArticleSummary(entry: Entry, tab: ArticlesTab) {
  if (tab === "psychology") {
    return getString(entry.metadata.snippet_en) || entry.content;
  }
  return getString(entry.metadata.summary_ru) || entry.content;
}

function getDisplayTitle(entry: Entry, tab: ArticlesTab) {
  if (tab === "psychology") {
    return entry.title;
  }
  return getString(entry.metadata.title_ru) || entry.title;
}

const QUERY_SOURCE_LABELS: Record<string, string> = {
  ollama: "из Ollama",
  config: "из конфига",
  static: "статические",
};

function getArticleQuery(entry: Entry) {
  return getString(entry.metadata.query);
}

function getPublishedAt(entry: Entry) {
  return getString(entry.metadata.published_at);
}

function getDiscoveredAt(entry: Entry) {
  return getString(entry.metadata.discovered_at) || entry.created_at;
}

function getArticleTier(entry: Entry) {
  return getString(entry.metadata.article_tier);
}

function getSourceSite(entry: Entry) {
  return getString(entry.metadata.source_site);
}

function isAccessChecked(entry: Entry) {
  return entry.metadata.article_access_checked === true;
}

function profileStatus(status: DigestStatus | null, tab: ArticlesTab): DigestProfileStatus | null {
  if (!status) {
    return null;
  }
  return tab === "psychology" ? status.psychology : status;
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
      const result = await tunePsychQueries(token);
      await loadArticles({ activeTab: tab });
      if (result.status === "ok") {
        setActionInfo(result.message);
      } else {
        setActionInfo(result.message);
      }
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {tab === "psychology" ? (
              <Brain className="h-5 w-5 text-primary" />
            ) : (
              <Newspaper className="h-5 w-5 text-primary" />
            )}
            <h1 className="text-2xl font-semibold tracking-tight">Статьи</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {tab === "psychology"
              ? "Англоязычные материалы по CBT, самоценности, схемам, отношениям и ACT из NHS, CCI, APA и научных баз."
              : "Свежие статьи про ИИ-агентов, Cursor, Claude и Codex с Habr."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "psychology" ? (
            <Button variant="outline" onClick={() => void handleTuneQueries()} disabled={isTuning}>
              {isTuning ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              Обновить запросы
            </Button>
          ) : null}
          <Button onClick={() => void handleRunDigest()} disabled={isRunning}>
            {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {runButtonLabel}
          </Button>
        </div>
      </div>

      <SegmentTabs
        value={tab}
        onChange={setTab}
        className="grid-cols-2 sm:max-w-xs"
        options={[
          { value: "ai", label: "ИИ" },
          { value: "psychology", label: "Психология" },
        ]}
      />

      {currentProfileStatus ? (
        <Card>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 py-4 text-sm">
            <div>
              <span className="text-muted-foreground">Последнее обновление: </span>
              <span>
                {currentProfileStatus.last_run_at
                  ? formatDate(currentProfileStatus.last_run_at)
                  : "ещё не было"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Следующий поиск: </span>
              <span>
                {currentProfileStatus.next_search_from
                  ? `с ${formatDate(currentProfileStatus.next_search_from)}`
                  : "актуально на сегодня"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Автообновление: </span>
              <span>
                {status?.scheduler_enabled
                  ? `каждый день в ${status.schedule_hour}:00`
                  : "выключено"}
              </span>
            </div>
            {tab === "psychology" && currentProfileStatus.query_source ? (
              <div>
                <span className="text-muted-foreground">Запросы: </span>
                <span>
                  {QUERY_SOURCE_LABELS[currentProfileStatus.query_source] ??
                    currentProfileStatus.query_source}
                </span>
              </div>
            ) : null}
            {tab === "psychology" && currentProfileStatus.last_error ? (
              <div className="text-destructive">
                Последняя ошибка: {currentProfileStatus.last_error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {actionInfo ? <Notice variant="info">{actionInfo}</Notice> : null}
      {actionError ? <Notice variant="error">{actionError}</Notice> : null}
      {loadError ? <Notice variant="error">{loadError}</Notice> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <FieldLabel htmlFor="articles-search" className="sr-only">
            Поиск статей
          </FieldLabel>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="articles-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по заголовку, описанию или ссылке"
            className="pl-9"
          />
        </div>
        {tab === "psychology" ? (
          <Select
            value={tierFilter}
            onChange={(event) => setTierFilter(event.target.value as PsychTierFilter)}
          >
            <option value="all">Все уровни</option>
            <option value="guides">Практика</option>
            <option value="popsci">Научпоп</option>
            <option value="science">Наука</option>
          </Select>
        ) : (
          <Select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
            {topicOptions.map((topic) => (
              <option key={topic} value={topic}>
                {topic === "all" ? "Все темы" : topic}
              </option>
            ))}
          </Select>
        )}
      </div>

      {!isLoading && total > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            {hasActiveFilter
              ? `Показано ${filteredArticles.length} из ${articles.length} загруженных · всего ${total}`
              : `Показано ${filteredArticles.length} из ${total}`}
          </span>
          {tab === "psychology" ? <span>Проверено доступных ссылок: {checkedLinks}</span> : null}
        </div>
      ) : null}

      {emptyStateKind === "loading" ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : emptyStateKind === "filtered-empty" ? (
        <Empty
          title="Ничего не найдено"
          description="Попробуйте другой запрос или сбросьте фильтры."
          actionLabel="Сбросить фильтры"
          onAction={resetFilters}
        />
      ) : emptyStateKind === "true-empty" ? (
        <Empty
          title={emptyTitle}
          actionLabel={emptyActionLabel}
          onAction={() => void handleRunDigest()}
        />
      ) : (
        <div className="grid gap-4">
          {filteredArticles.map((article) => {
            const url = getArticleUrl(article);
            const topic = getArticleQuery(article);
            const tier = getArticleTier(article);
            const sourceSite = getSourceSite(article);
            const isPending = feedbackPendingId === article.id;
            const primaryBadges: Array<{ key: string; node: React.ReactNode }> = [];
            if (tab === "psychology" && tier && tier in TIER_LABELS) {
              primaryBadges.push({
                key: "tier",
                node: (
                  <Badge variant="secondary">
                    {TIER_LABELS[tier as Exclude<PsychTierFilter, "all">]}
                  </Badge>
                ),
              });
            }
            if (tab === "psychology" && sourceSite) {
              primaryBadges.push({ key: "source", node: <Badge variant="outline">{sourceSite}</Badge> });
            } else if (tab === "psychology") {
              primaryBadges.push({ key: "en", node: <Badge variant="outline">EN</Badge> });
            }
            const visibleBadges = primaryBadges.slice(0, 2);
            const metaParts = [
              tab === "psychology" && isAccessChecked(article) ? "Ссылка проверена" : null,
              topic ? `Запрос: ${topic}` : null,
              getPublishedAt(article)
                ? `Опубликовано: ${formatDate(getPublishedAt(article))}`
                : `Найдено: ${formatDate(getDiscoveredAt(article))}`,
            ].filter(Boolean);
            return (
              <Card key={article.id}>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {visibleBadges.map((badge) => (
                      <span key={badge.key}>{badge.node}</span>
                    ))}
                  </div>
                  <CardTitle className="text-lg leading-snug">{getDisplayTitle(article, tab)}</CardTitle>
                  {metaParts.length > 0 ? (
                    <p className="text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-3 text-sm text-muted-foreground">{getArticleSummary(article, tab)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                      >
                        {tab === "psychology" ? "Открыть статью (EN)" : "Открыть статью"}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      title={
                        tab === "psychology"
                          ? "Статья в теме, но не интересна — скрыть и не предлагать похожие"
                          : "Статья в теме, но не интересна — скрыть и не предлагать похожие"
                      }
                      onClick={() => void handleFeedback(article.id, "dislike")}
                    >
                      <ThumbsDown className="h-4 w-4" />
                      Не нравится
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      title={
                        tab === "psychology"
                          ? "Не про CBT и когнитивные искажения — скрыть и не предлагать похожие темы"
                          : "Не про ИИ-агентов и инструменты — скрыть и не предлагать похожие темы"
                      }
                      onClick={() => void handleFeedback(article.id, "off_topic")}
                    >
                      <Ban className="h-4 w-4" />
                      Не в тему
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {hasMore && !isLoading ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={isLoadingMore}
            onClick={() => void loadArticles({ append: true, offset: articles.length, activeTab: tab })}
          >
            {isLoadingMore ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            Показать ещё
          </Button>
        </div>
      ) : null}
    </div>
  );
}
