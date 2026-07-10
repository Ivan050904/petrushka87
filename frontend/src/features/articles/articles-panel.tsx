"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Newspaper, Play, RefreshCw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/use-auth";
import { getDigestStatus, getErrorMessage, listEntries, runDigest } from "@/lib/api";
import type { DigestStatus } from "@/lib/api";
import { formatDate, getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";

function getArticleUrl(entry: Entry) {
  return getString(entry.metadata.url);
}

function getArticleSummary(entry: Entry) {
  return getString(entry.metadata.summary_ru) || entry.content;
}

function getArticleQuery(entry: Entry) {
  return getString(entry.metadata.query);
}

function getPublishedAt(entry: Entry) {
  return getString(entry.metadata.published_at);
}

function getDiscoveredAt(entry: Entry) {
  return getString(entry.metadata.discovered_at) || entry.created_at;
}

export function ArticlesPanel() {
  const { token } = useRequireAuth();
  const [articles, setArticles] = useState<Entry[]>([]);
  const [status, setStatus] = useState<DigestStatus | null>(null);
  const [query, setQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  async function loadArticles() {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const [entriesResult, digestStatus] = await Promise.all([
        listEntries(token, { type: "resource", kind: "article", limit: 100 }),
        getDigestStatus(token),
      ]);
      setArticles(entriesResult.items);
      setStatus(digestStatus);
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить статьи."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadArticles();
  }, [token]);

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
      if (!normalizedQuery) {
        return true;
      }
      const haystack = [
        article.title,
        article.content,
        getArticleSummary(article),
        topic,
        getArticleUrl(article),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [articles, query, topicFilter]);

  async function handleRunDigest() {
    if (!token) {
      return;
    }

    setIsRunning(true);
    setActionError(null);
    try {
      const result = await runDigest(token);
      await loadArticles();
      if (result.articles_saved === 0 && !["ok", "up_to_date"].includes(result.status)) {
        setActionError(result.message);
      }
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось запустить дайджест."));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Статьи</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Свежие статьи про ИИ-агентов, Cursor, Claude и Codex с Habr.
          </p>
        </div>
        <Button onClick={() => void handleRunDigest()} disabled={isRunning}>
          {isRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Запустить дайджест сейчас
        </Button>
      </div>

      {status ? (
        <Card>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 py-4 text-sm">
            <div>
              <span className="text-muted-foreground">Последнее обновление: </span>
              <span>{status.last_run_at ? formatDate(status.last_run_at) : "ещё не было"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Следующий поиск: </span>
              <span>
                {status.next_search_from
                  ? `с ${formatDate(status.next_search_from)}`
                  : "актуально на сегодня"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Автообновление: </span>
              <span>
                {status.scheduler_enabled
                  ? `каждый день в ${status.schedule_hour}:00`
                  : "выключено"}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {actionError ? <Notice variant="error">{actionError}</Notice> : null}
      {loadError ? <Notice variant="error">{loadError}</Notice> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по заголовку, описанию или ссылке"
            className="pl-9"
          />
        </div>
        <Select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)}>
          {topicOptions.map((topic) => (
            <option key={topic} value={topic}>
              {topic === "all" ? "Все темы" : topic}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка статей...</div>
      ) : filteredArticles.length === 0 ? (
        <Empty
          title="Статей пока нет. Запустите дайджест вручную или дождитесь утреннего автозапуска."
          actionLabel="Запустить дайджест"
          onAction={() => void handleRunDigest()}
        />
      ) : (
        <div className="grid gap-4">
          {filteredArticles.map((article) => {
            const url = getArticleUrl(article);
            const topic = getArticleQuery(article);
            return (
              <Card key={article.id}>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {topic ? <Badge variant="secondary">{topic}</Badge> : null}
                    {getPublishedAt(article) ? (
                      <Badge variant="outline">Опубликовано: {formatDate(getPublishedAt(article))}</Badge>
                    ) : (
                      <Badge variant="outline">Найдено: {formatDate(getDiscoveredAt(article))}</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg leading-snug">{article.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{getArticleSummary(article)}</p>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      Открыть статью
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
