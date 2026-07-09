"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenText, FilePenLine, Plus, Search, StickyNote, Trash2, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, deleteEntry, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import { getString } from "@/lib/entry-helpers";
import type { Entry, EntryType } from "@/lib/types";
import { cn } from "@/lib/utils";

type JournalMode = Extract<EntryType, "note" | "diary">;

const JOURNAL_DRAFT_STORAGE_KEY = "folio_one_journal_draft";
const today = () => new Date().toISOString().slice(0, 10);

function sortJournalEntries(entries: Entry[]) {
  return entries.toSorted(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  );
}

export default function JournalPage() {
  const { token, user } = useRequireAuth();
  const [mode, setMode] = useState<JournalMode>("diary");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [journalQuery, setJournalQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const draftKey = user?.id ? `${JOURNAL_DRAFT_STORAGE_KEY}:${user.id}` : null;

  useEffect(() => {
    if (!token) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      listEntries(token, { type: "diary", limit: 50, exclude_collection: "life_notes" }),
      listEntries(token, { type: "note", limit: 50 }),
    ])
      .then(([diaryEntries, noteEntries]) => {
        if (isMounted) {
          setEntries(sortJournalEntries([...diaryEntries.items, ...noteEntries.items]));
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setLoadError(getErrorMessage(requestError, "Не удалось загрузить журнал."));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  useEffect(() => {
    setIsDraftLoaded(false);
    if (!draftKey) {
      return;
    }

    try {
      const draft = parseJournalDraft(window.localStorage.getItem(draftKey));
      if (draft) {
        setMode(draft.mode);
        setTitle(draft.title);
        setContent(draft.content);
        setEntryDate(draft.entryDate);
      }
    } catch {
      return;
    } finally {
      setIsDraftLoaded(true);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || !isDraftLoaded || selectedId) {
      return;
    }

    try {
      if (hasJournalDraft({ mode, title, content, entryDate })) {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ mode, title, content, entryDate }),
        );
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      return;
    }
  }, [content, draftKey, entryDate, isDraftLoaded, mode, selectedId, title]);

  const filteredEntries = useMemo(() => {
    const query = journalQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entry.type !== mode) {
        return false;
      }

      const matchesQuery =
        !query ||
        entry.title.toLowerCase().includes(query) ||
        entry.content.toLowerCase().includes(query);
      const matchesDate = !dateFilter || entryDateForFilter(entry) === dateFilter;
      return matchesQuery && matchesDate;
    });
  }, [dateFilter, entries, journalQuery, mode]);
  const hasActiveFilters = Boolean(journalQuery.trim()) || Boolean(dateFilter);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  function resetJournalFilters() {
    setJournalQuery("");
    setDateFilter("");
  }

  function clearJournalDraft() {
    if (!draftKey) {
      return;
    }

    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      return;
    }
  }

  function selectJournalEntry(entry: Entry) {
    const nextMode = entry.type === "diary" ? "diary" : "note";
    setSelectedId(entry.id);
    setMode(nextMode);
    setTitle(entry.title);
    setContent(entry.content);
    setEntryDate(getString(entry.metadata.entry_date, entry.created_at.slice(0, 10)));
    setError(null);
  }

  function startNewJournalEntry() {
    clearJournalDraft();
    setSelectedId(null);
    setTitle("");
    setContent("");
    setEntryDate(today());
    setError(null);
  }

  async function saveJournalEntry() {
    if (!token || isSaving) {
      return;
    }

    if (!content.trim()) {
      setError("Добавь текст записи.");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const fallbackTitle = mode === "diary" ? `Дневник ${entryDate}` : content.trim().split("\n")[0];
      const payload = {
        type: mode,
        title: title.trim() || fallbackTitle,
        content: content.trim(),
        metadata:
          mode === "diary"
            ? { entry_date: entryDate, mode: "diary" }
            : { mode: "note" },
      } as const;
      const saved = selectedId
        ? await updateEntry(token, selectedId, payload)
        : await createEntry(token, payload);
      setEntries((current) =>
        sortJournalEntries(
          selectedId
            ? current.map((entry) => (entry.id === saved.id ? saved : entry))
            : [saved, ...current],
        ),
      );
      if (selectedId) {
        selectJournalEntry(saved);
      } else {
        startNewJournalEntry();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить запись."));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeJournalEntry(entry: Entry) {
    if (!token) {
      return;
    }

    const confirmed = window.confirm(`Удалить запись "${entry.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteEntry(token, entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (selectedId === entry.id) {
        startNewJournalEntry();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить запись."));
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold leading-8">Журнал</h1>
          <p className="text-sm text-muted-foreground">Дневник с датой и свободные заметки.</p>
        </header>

        {loadError ? <Notice variant="error">{loadError}</Notice> : null}

        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle>{selectedEntry ? "Запись" : "Новая запись"}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div
                  className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-1"
                  role="group"
                  aria-label="Режим записи"
                >
                  <Button
                    type="button"
                    variant={mode === "diary" ? "secondary" : "ghost"}
                    aria-pressed={mode === "diary"}
                    onClick={() => setMode("diary")}
                  >
                    <BookOpenText data-icon="inline-start" />
                    Дневник
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "note" ? "secondary" : "ghost"}
                    aria-pressed={mode === "note"}
                    onClick={() => setMode("note")}
                  >
                    <StickyNote data-icon="inline-start" />
                    Заметка
                  </Button>
                </div>

                <Field>
                  <FieldLabel htmlFor="journal-title">Название</FieldLabel>
                  <Input
                    id="journal-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>

                {mode === "diary" ? (
                  <Field>
                    <FieldLabel htmlFor="journal-date">Дата</FieldLabel>
                    <Input
                      id="journal-date"
                      type="date"
                      value={entryDate}
                      onChange={(event) => setEntryDate(event.target.value)}
                    />
                  </Field>
                ) : null}

                <Field>
                  <FieldLabel htmlFor="journal-content">Текст</FieldLabel>
                  <Textarea
                    id="journal-content"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    className="min-h-36 text-base leading-6"
                  />
                </Field>

                {error ? <FieldError>{error}</FieldError> : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={saveJournalEntry} disabled={isSaving}>
                    <FilePenLine data-icon="inline-start" />
                    {isSaving ? "Сохранение" : "Сохранить"}
                  </Button>
                  {selectedEntry ? (
                    <Button variant="outline" onClick={startNewJournalEntry}>
                      <Plus data-icon="inline-start" />
                      Новая запись
                    </Button>
                  ) : null}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{mode === "diary" ? "Дневник" : "Заметки"}</CardTitle>
              <div className="flex items-center gap-2">
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetJournalFilters}>
                    <X data-icon="inline-start" />
                    Сбросить
                  </Button>
                ) : null}
                <Badge variant="secondary">{filteredEntries.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <Field>
                  <FieldLabel htmlFor="journal-search">Поиск</FieldLabel>
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="journal-search"
                      value={journalQuery}
                      onChange={(event) => setJournalQuery(event.target.value)}
                      className="pl-10"
                    />
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="journal-date-filter">Дата</FieldLabel>
                  <Input
                    id="journal-date-filter"
                    type="date"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                  />
                </Field>
              </div>

              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-md bg-muted" />
                ))
              ) : filteredEntries.length === 0 ? (
                <Empty title={entries.some((entry) => entry.type === mode) ? "Записи не найдены" : mode === "diary" ? "Дневниковых записей пока нет" : "Заметок пока нет"} />
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredEntries.map((entry) => (
                    <article
                      key={entry.id}
                      className={cn(
                        "min-h-16 rounded-md border border-border bg-background px-3 py-2",
                        entry.type === "diary" ? "border-l-primary" : "border-l-secondary",
                        "border-l-4",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h2 className="truncate text-sm font-medium">{entry.title}</h2>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant={entry.type === "diary" ? "default" : "secondary"}>
                            {entry.type === "diary" ? "Дневник" : "Заметка"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectJournalEntry(entry)}
                          >
                            <FilePenLine data-icon="inline-start" />
                            Открыть
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Удалить запись ${entry.title}`}
                            onClick={() => void removeJournalEntry(entry)}
                          >
                            <Trash2 data-icon />
                          </Button>
                        </div>
                      </div>
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{entry.content}</p>
                      {entry.type === "diary" ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {getString(entry.metadata.entry_date, "Без даты")}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function entryDateForFilter(entry: Entry) {
  if (entry.type === "diary") {
    return getString(entry.metadata.entry_date, entry.created_at.slice(0, 10));
  }
  return entry.created_at.slice(0, 10);
}

function parseJournalDraft(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = JSON.parse(value) as Partial<{
    mode: JournalMode;
    title: string;
    content: string;
    entryDate: string;
  }>;
  const mode: JournalMode = parsed.mode === "note" ? "note" : "diary";
  return {
    mode,
    title: typeof parsed.title === "string" ? parsed.title : "",
    content: typeof parsed.content === "string" ? parsed.content : "",
    entryDate: typeof parsed.entryDate === "string" ? parsed.entryDate : today(),
  };
}

function hasJournalDraft({
  mode,
  title,
  content,
  entryDate,
}: {
  mode: JournalMode;
  title: string;
  content: string;
  entryDate: string;
}) {
  return Boolean(title.trim()) || Boolean(content.trim()) || (mode === "diary" && entryDate !== today());
}
