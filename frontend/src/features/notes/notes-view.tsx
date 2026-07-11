"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { NoteEditor } from "@/features/notes/note-editor";
import { LoadError } from "@/components/load-error";
import { NotesFab } from "@/features/notes/notes-fab";
import { NotesGrid } from "@/features/notes/notes-grid";
import { NotesHeader } from "@/features/notes/notes-header";
import { useRequireAuth } from "@/hooks/use-auth";
import { createEntry, getEntry, getErrorMessage, listEntries } from "@/lib/api";
import {
  DEFAULT_LIFE_NOTE_CATEGORY,
  getLifeNoteCategory,
  LIFE_NOTES_COLLECTION,
  LIFE_NOTES_PAGE_SIZE,
} from "@/lib/life-notes";
import { notesHref, notesNewHref } from "@/lib/navigation";
import type { Entry } from "@/lib/types";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}

export function NotesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useRequireAuth();
  const selectedId = searchParams.get("id");
  const isNew = searchParams.get("new") === "1";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedEntryOverride, setSelectedEntryOverride] = useState<Entry | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadGenerationRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const entriesLengthRef = useRef(0);
  entriesLengthRef.current = entries.length;
  const debouncedQuery = useDebouncedValue(query, 300);

  function mergeEntries(current: Entry[], incoming: Entry[]) {
    if (incoming.length === 0) {
      return current;
    }
    const seen = new Set(current.map((entry) => entry.id));
    const uniqueIncoming = incoming.filter((entry) => !seen.has(entry.id));
    return uniqueIncoming.length > 0 ? [...current, ...uniqueIncoming] : current;
  }

  const categories = useMemo(() => {
    const values = new Set<string>([DEFAULT_LIFE_NOTE_CATEGORY]);
    for (const entry of entries) {
      values.add(getLifeNoteCategory(entry));
    }
    return Array.from(values);
  }, [entries]);

  const selectedEntry = useMemo(() => {
    if (selectedEntryOverride && selectedEntryOverride.id === selectedId) {
      return selectedEntryOverride;
    }
    return entries.find((entry) => entry.id === selectedId) ?? null;
  }, [entries, selectedId, selectedEntryOverride]);

  const hasMore = entries.length < total;

  const loadEntries = useCallback(
    async (options?: { reset?: boolean }) => {
      if (!token) {
        return;
      }

      const reset = options?.reset ?? false;
      if (!reset && isLoadingMoreRef.current) {
        return;
      }

      const generation = reset ? ++loadGenerationRef.current : loadGenerationRef.current;

      if (reset) {
        setIsLoading(true);
      } else {
        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
      }
      setLoadError(null);

      try {
        const response = await listEntries(token, {
          type: "diary",
          collection: LIFE_NOTES_COLLECTION,
          category: activeCategory ?? undefined,
          q: debouncedQuery || undefined,
          limit: LIFE_NOTES_PAGE_SIZE,
          offset: reset ? 0 : entriesLengthRef.current,
          sort: "entry_date_desc",
        });

        if (generation !== loadGenerationRef.current) {
          return;
        }

        setTotal(response.total);
        setEntries((current) => (reset ? response.items : mergeEntries(current, response.items)));
      } catch (error) {
        if (generation === loadGenerationRef.current) {
          setLoadError(getErrorMessage(error, "Не удалось загрузить заметки."));
        }
      } finally {
        if (generation !== loadGenerationRef.current) {
          return;
        }
        setIsLoading(false);
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    },
    [token, activeCategory, debouncedQuery],
  );

  useEffect(() => {
    setEntries([]);
    setTotal(0);
    void loadEntries({ reset: true });
    // loadEntries is recreated only when filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeCategory, debouncedQuery]);

  useEffect(() => {
    if (!token || !selectedId) {
      setSelectedEntryOverride(null);
      return;
    }
    if (entries.some((entry) => entry.id === selectedId)) {
      setSelectedEntryOverride(null);
      return;
    }

    let isMounted = true;
    getEntry(token, selectedId)
      .then((entry) => {
        if (isMounted) {
          setSelectedEntryOverride(entry);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSelectedEntryOverride(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token, selectedId, entries]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    function handleScroll() {
      const node = scrollContainerRef.current;
      if (!node || !hasMore || isLoading || isLoadingMore) {
        return;
      }
      const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (remaining < 240) {
        void loadEntries();
      }
    }

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoading, isLoadingMore, loadEntries]);

  function openEntry(entryId: string) {
    router.push(notesHref(entryId));
  }

  function createTodayNote() {
    router.push(notesNewHref());
  }

  function handleSaved(entry: Entry) {
    setEntries((current) => {
      const exists = current.some((item) => item.id === entry.id);
      const without = current.filter((item) => item.id !== entry.id);
      if (!exists) {
        setTotal((value) => value + 1);
      }
      return [entry, ...without];
    });
  }

  function handleDeleted(entryId: string) {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    setTotal((current) => Math.max(0, current - 1));
  }

  if (selectedId || isNew) {
    return (
      <div className="notes-surface flex min-h-0 flex-1 flex-col">
        <NoteEditor
          token={token ?? ""}
          entry={selectedEntry}
          isNew={isNew}
          defaultCategory={activeCategory}
          onBack={() => router.push(notesHref())}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      </div>
    );
  }

  return (
    <div className="notes-surface flex min-h-0 flex-1 flex-col">
      <NotesHeader
        query={query}
        onQueryChange={setQuery}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        total={isLoading ? null : total}
      />

      <div ref={scrollContainerRef} className="notes-scrollbar min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-6 py-16 text-sm text-[var(--notes-muted)]">Загружаем заметки...</div>
        ) : loadError ? (
          <div className="px-6 py-16">
            <LoadError message={loadError} onRetry={() => void loadEntries({ reset: true })} />
          </div>
        ) : (
          <>
            <NotesGrid entries={entries} onSelect={openEntry} />
            {isLoadingMore ? (
              <div className="px-6 pb-8 text-center text-sm text-[var(--notes-muted)]">
                Загружаем ещё...
              </div>
            ) : null}
          </>
        )}
      </div>

      <NotesFab onClick={createTodayNote} />
    </div>
  );
}
