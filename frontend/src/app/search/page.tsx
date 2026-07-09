"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage, listEntries } from "@/lib/api";
import { entryDescription, entryModuleHref, formatCurrency, formatDate, getNumber, getString } from "@/lib/entry-helpers";
import { formatEntryType, formatFinanceDirection, formatTaskStatus } from "@/lib/labels";
import { MVP_ENTRY_TYPES, type Entry, type EntryType } from "@/lib/types";
import { cn } from "@/lib/utils";

function readSearchQueryParam() {
  if (typeof window === "undefined") {
    return "";
  }
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

export default function SearchPage() {
  const { token } = useRequireAuth();
  const [query, setQuery] = useState(readSearchQueryParam);
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [results, setResults] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const trimmedQuery = query.trim();
  const hasActiveFilters = Boolean(trimmedQuery) || typeFilter !== "all";

  function resetFilters() {
    setQuery("");
    setTypeFilter("all");
  }

  useEffect(() => {
    setQuery(readSearchQueryParam());
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    const timeoutId = window.setTimeout(() => {
      listEntries(token, {
        q: trimmedQuery || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
        limit: 100,
      })
        .then((result) => {
          if (isMounted) {
            setResults(result.items);
          }
        })
        .catch((requestError) => {
          if (isMounted) {
            setLoadError(getErrorMessage(requestError, "Не удалось выполнить поиск."));
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [token, trimmedQuery, typeFilter]);

  const resultSummary = useMemo(() => {
    if (typeFilter === "all") {
      return `${results.length} записей`;
    }
    return `${results.length} · ${formatEntryType(typeFilter)}`;
  }, [results.length, typeFilter]);

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold leading-8">Поиск</h1>
          <p className="text-sm text-muted-foreground">Поиск по названию, содержимому и типу записи.</p>
        </header>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Фильтры</CardTitle>
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X data-icon="inline-start" />
                Сбросить
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <Field>
                  <FieldLabel htmlFor="search-query">Запрос</FieldLabel>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="search-query"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-10"
                    />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="search-type">Тип</FieldLabel>
                  <Select
                    id="search-type"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as EntryType | "all")}
                  >
                    <option value="all">{formatEntryType("all")}</option>
                    {MVP_ENTRY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {formatEntryType(type)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-2" aria-label="Быстрый фильтр типа">
                {(["all", ...MVP_ENTRY_TYPES] as Array<EntryType | "all">).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={typeFilter === type}
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                    "focus-ring min-h-10 rounded-md border px-3 text-sm font-medium transition",
                      typeFilter === type
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {formatEntryType(type)}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold">Результаты</h2>
            <Badge variant="secondary">{isLoading ? "Поиск" : resultSummary}</Badge>
          </div>

          {loadError ? (
            <Notice variant="error">{loadError}</Notice>
          ) : isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-24 rounded-md bg-muted" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <Empty title="Ничего не найдено" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {results.map((entry) => (
                <SearchResultCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function SearchResultCard({ entry }: { entry: Entry }) {
  return (
    <article className="rounded-md border border-border bg-card p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{entry.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {entry.content}
          </p>
          <ResultDetails entry={entry} />
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDate(entry.updated_at)}
          </p>
        </div>
        <Badge variant="secondary">{formatEntryType(entry.type)}</Badge>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={entryModuleHref(entry)}>
          Открыть
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </article>
  );
}

function ResultDetails({ entry }: { entry: Entry }) {
  if (entry.type === "finance") {
    const amount = getNumber(entry.metadata.amount);
    const currency = getString(entry.metadata.currency, "RUB");
    const direction = getString(entry.metadata.direction, "expense");
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-semibold text-foreground">
          {formatCurrency(amount, currency)}
        </span>
        <Badge variant={direction === "income" ? "default" : "secondary"}>
          {formatFinanceDirection(direction)}
        </Badge>
      </div>
    );
  }

  if (entry.type === "habit") {
    const details = [
      habitStageLabel(getString(entry.metadata.stage, "desired")),
      habitRegularityLabel(entry.metadata.regularity),
    ].filter(Boolean);
    return details.length > 0 ? (
      <p className="mt-2 truncate text-sm text-muted-foreground">{details.join(" · ")}</p>
    ) : null;
  }

  if (entry.type === "task") {
    const details = [
      formatTaskStatus(getString(entry.metadata.status, "inbox")),
      getString(entry.metadata.project),
      formatOptionalDate(getString(entry.metadata.deadline)),
    ].filter(Boolean);
    return details.length > 0 ? (
      <p className="mt-2 truncate text-sm text-muted-foreground">{details.join(" · ")}</p>
    ) : null;
  }

  if (entry.type === "event") {
    const details = [
      formatOptionalDate(getString(entry.metadata.starts_at)),
      getString(entry.metadata.location),
    ].filter(Boolean);
    return details.length > 0 ? (
      <p className="mt-2 truncate text-sm text-muted-foreground">{details.join(" · ")}</p>
    ) : null;
  }

  if (entry.type === "person") {
    const description = getString(entry.metadata.description);
    return description ? (
      <p className="mt-2 truncate text-sm text-muted-foreground">{description}</p>
    ) : null;
  }

  if (entry.type === "diary") {
    const entryDate = getString(entry.metadata.entry_date);
    return entryDate ? (
      <p className="mt-2 text-sm text-muted-foreground">{entryDate}</p>
    ) : null;
  }

  if (entry.type === "resource") {
    const filename = getString(readFileMetadata(entry).filename);
    return filename ? (
      <p className="mt-2 truncate text-sm text-muted-foreground">{filename}</p>
    ) : null;
  }

  return entry.type === "note" && entryDescription(entry) !== entry.content ? (
    <p className="mt-2 truncate text-sm text-muted-foreground">{entryDescription(entry)}</p>
  ) : null;
}

function habitStageLabel(stage: string) {
  const labels: Record<string, string> = {
    desired: "Хочу внедрить",
    tracking: "Отслеживаю",
    automatic: "Автоматическая",
    archived: "Архив",
  };
  return labels[stage] ?? stage;
}

function habitRegularityLabel(value: unknown) {
  const regularity = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const kind = getString(regularity.kind, "daily");
  if (kind === "weekdays") {
    const weekdays = Array.isArray(regularity.weekdays) ? regularity.weekdays.length : 0;
    return `${weekdays} дн. в неделю`;
  }
  if (kind === "weekly_target") {
    return `${getNumber(regularity.target)} раз в неделю`;
  }
  if (kind === "monthly_target") {
    return `${getNumber(regularity.target)} раз в месяц`;
  }
  return "Ежедневно";
}

function formatOptionalDate(value: string) {
  return value ? formatDate(value) : "";
}

function readFileMetadata(entry: Entry) {
  const fileMetadata = entry.metadata.file;
  return fileMetadata && typeof fileMetadata === "object" && !Array.isArray(fileMetadata)
    ? (fileMetadata as Record<string, unknown>)
    : {};
}
