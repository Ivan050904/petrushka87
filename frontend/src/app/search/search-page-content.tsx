"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Search, X } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadError } from "@/components/load-error";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { useRequireAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { searchEntriesBounded } from "@/lib/entry-queries";
import { entryDescription, entryModuleHref, formatCurrency, formatDate, getNumber, getString } from "@/lib/entry-helpers";
import { formatEntryType, formatFinanceDirection, formatTaskStatus } from "@/lib/labels";
import { MVP_ENTRY_TYPES, type Entry, type EntryType } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SearchPageContent() {
  const { token } = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [typeFilter, setTypeFilter] = useState<EntryType | "all">("all");
  const [results, setResults] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const trimmedQuery = query.trim();
  const hasActiveFilters = Boolean(trimmedQuery) || typeFilter !== "all";

  function resetFilters() {
    setQuery("");
    setTypeFilter("all");
  }

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    const timeoutId = window.setTimeout(() => {
      searchEntriesBounded(token, {
        q: trimmedQuery || undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
      })
        .then((result) => {
          if (isMounted) {
            setResults(result.items);
            setTotal(result.total);
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `/search?${next}` : "/search", { scroll: false });
    }
  }, [trimmedQuery, router, searchParams]);

  const groupedResults = useMemo(() => {
    const groups = new Map<EntryType, Entry[]>();
    for (const entry of results) {
      const current = groups.get(entry.type) ?? [];
      current.push(entry);
      groups.set(entry.type, current);
    }
    return groups;
  }, [results]);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Поиск</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Найди задачи, заметки, финансы и другие записи по тексту.
            {total > results.length ? ` Показаны первые ${results.length} из ${total}.` : null}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="size-4" />
              Фильтры
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
              <Field>
                <FieldLabel htmlFor="search-query">Запрос</FieldLabel>
                <Input
                  id="search-query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Например: проект, встреча, расходы"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="search-type">Тип</FieldLabel>
                <Select
                  id="search-type"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as EntryType | "all")}
                >
                  <option value="all">Все типы</option>
                  {MVP_ENTRY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatEntryType(type)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="ghost" onClick={resetFilters} disabled={!hasActiveFilters}>
                  <X className="size-4" />
                  Сбросить
                </Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        {loadError ? <LoadError message={loadError} onRetry={() => setQuery((value) => value)} /> : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Поиск...</p>
        ) : results.length === 0 ? (
          <Empty
            title={hasActiveFilters ? "Ничего не найдено" : "Введите запрос"}
            description={
              hasActiveFilters
                ? "Попробуйте другой текст или снимите фильтр по типу."
                : "Можно искать по названию, содержимому и метаданным."
            }
          />
        ) : (
          <div className="space-y-6">
            {Array.from(groupedResults.entries()).map(([type, entries]) => (
              <section key={type} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatEntryType(type)}
                  </h2>
                  <Badge variant="secondary">{entries.length}</Badge>
                </div>
                <div className="grid gap-3">
                  {entries.map((entry) => (
                    <SearchResultCard key={entry.id} entry={entry} query={trimmedQuery} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SearchResultCard({ entry, query }: { entry: Entry; query: string }) {
  const href = entryModuleHref(entry);
  const description = entryDescription(entry);
  const status =
    entry.type === "task" ? formatTaskStatus(getString(entry.metadata.status, "inbox")) : null;
  const amount =
    entry.type === "finance"
      ? formatCurrency(getNumber(entry.metadata.amount), getString(entry.metadata.currency, "RUB"))
      : null;
  const direction =
    entry.type === "finance"
      ? formatFinanceDirection(getString(entry.metadata.direction, "expense"))
      : null;

  return (
    <Link
      href={href}
      className={cn(
        "focus-ring block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{entry.title || "Без названия"}</p>
            <Badge variant="outline">{formatEntryType(entry.type)}</Badge>
            {status ? <Badge variant="secondary">{status}</Badge> : null}
            {amount ? (
              <Badge variant="secondary">
                {direction}: {amount}
              </Badge>
            ) : null}
          </div>
          {description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{highlightMatch(description, query)}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">{formatDate(entry.updated_at)}</p>
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) {
    return text;
  }
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return text;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/15 px-0.5">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}
