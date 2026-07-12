import { formatDate, getString } from "@/lib/entry-helpers";
import type { Entry } from "@/lib/types";

export type ArticlesTab = "ai" | "psychology";
export type PsychTierFilter = "all" | "guides" | "popsci" | "science";

export const TIER_LABELS: Record<Exclude<PsychTierFilter, "all">, string> = {
  guides: "Практика",
  popsci: "Научпоп",
  science: "Наука",
};

export const QUERY_SOURCE_LABELS: Record<string, string> = {
  ollama: "из Ollama",
  config: "из конфига",
  static: "статические",
};

export type ArticleDateGroup = "today" | "yesterday" | "this_week" | "earlier";

export const ARTICLE_DATE_GROUP_LABELS: Record<ArticleDateGroup, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  this_week: "На этой неделе",
  earlier: "Ранее",
};

export function getArticleUrl(entry: Entry) {
  return getString(entry.metadata.url);
}

export function getArticleSummary(entry: Entry, tab: ArticlesTab) {
  if (tab === "psychology") {
    return getString(entry.metadata.snippet_en) || entry.content;
  }
  return getString(entry.metadata.summary_ru) || entry.content;
}

export function getDisplayTitle(entry: Entry, tab: ArticlesTab) {
  if (tab === "psychology") {
    return entry.title;
  }
  return getString(entry.metadata.title_ru) || entry.title;
}

export function getArticleQuery(entry: Entry) {
  return getString(entry.metadata.query);
}

export function getPublishedAt(entry: Entry) {
  return getString(entry.metadata.published_at);
}

export function getDiscoveredAt(entry: Entry) {
  return getString(entry.metadata.discovered_at) || entry.created_at;
}

export function getArticleTier(entry: Entry) {
  return getString(entry.metadata.article_tier);
}

export function getSourceSite(entry: Entry) {
  return getString(entry.metadata.source_site);
}

export function isAccessChecked(entry: Entry) {
  return entry.metadata.article_access_checked === true;
}

export function getHostname(url: string) {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getFaviconUrl(url: string) {
  const hostname = getHostname(url);
  if (!hostname) {
    return null;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
}

export function getArticleMetaParts(entry: Entry, tab: ArticlesTab) {
  const topic = getArticleQuery(entry);
  return [
    tab === "psychology" && isAccessChecked(entry) ? "Ссылка проверена" : null,
    topic ? `Запрос: ${topic}` : null,
    getPublishedAt(entry)
      ? `Опубликовано: ${formatDate(getPublishedAt(entry))}`
      : `Найдено: ${formatDate(getDiscoveredAt(entry))}`,
  ].filter(Boolean) as string[];
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getArticleDateGroup(entry: Entry, now = new Date()): ArticleDateGroup {
  const raw = getDiscoveredAt(entry);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "earlier";
  }

  const today = startOfDay(now);
  const articleDay = startOfDay(date);
  const diffMs = today.getTime() - articleDay.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return "today";
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  if (diffDays < 7) {
    return "this_week";
  }
  return "earlier";
}

const GROUP_ORDER: ArticleDateGroup[] = ["today", "yesterday", "this_week", "earlier"];

export function groupArticlesByDate(entries: Entry[], now = new Date()) {
  const buckets = new Map<ArticleDateGroup, Entry[]>();
  for (const group of GROUP_ORDER) {
    buckets.set(group, []);
  }
  for (const entry of entries) {
    const group = getArticleDateGroup(entry, now);
    buckets.get(group)?.push(entry);
  }
  return GROUP_ORDER.map((group) => ({
    group,
    label: ARTICLE_DATE_GROUP_LABELS[group],
    entries: buckets.get(group) ?? [],
  })).filter((section) => section.entries.length > 0);
}
