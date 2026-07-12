"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import {
  createEntryLink,
  deleteEntryLink,
  getErrorMessage,
  listEntries,
  listEntryLinks,
  type EntryLink,
} from "@/lib/api";
import { entryModuleHref } from "@/lib/entry-helpers";
import { formatEntryType } from "@/lib/labels";
import type { Entry } from "@/lib/types";

type EntryLinksPanelProps = {
  token: string | null;
  entry: Entry;
  className?: string;
};

export function EntryLinksPanel({ token, entry, className }: EntryLinksPanelProps) {
  const [links, setLinks] = useState<EntryLink[]>([]);
  const [linkedEntries, setLinkedEntries] = useState<Entry[]>([]);
  const [candidates, setCandidates] = useState<Entry[]>([]);
  const [targetId, setTargetId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadLinks = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const nextLinks = await listEntryLinks(token, entry.id);
      setLinks(nextLinks);
      const ids = new Set<string>();
      for (const link of nextLinks) {
        ids.add(link.source_entry_id === entry.id ? link.target_entry_id : link.source_entry_id);
      }
      if (ids.size === 0) {
        setLinkedEntries([]);
        return;
      }
      const related = await listEntries(token, { limit: 100 });
      setLinkedEntries(related.items.filter((item) => ids.has(item.id)));
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось загрузить связи."));
    } finally {
      setIsLoading(false);
    }
  }, [token, entry.id]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    if (!token || !query.trim()) {
      setCandidates([]);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void listEntries(token, { q: query.trim(), limit: 20 })
        .then((result) => setCandidates(result.items.filter((item) => item.id !== entry.id)))
        .catch(() => setCandidates([]));
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [token, query, entry.id]);

  async function addLink() {
    if (!token || !targetId) {
      return;
    }
    setError(null);
    try {
      await createEntryLink(token, entry.id, { target_entry_id: targetId, link_type: "related" });
      setTargetId("");
      setQuery("");
      await loadLinks();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось создать связь."));
    }
  }

  async function removeLink(linkId: string) {
    if (!token) {
      return;
    }
    setError(null);
    try {
      await deleteEntryLink(token, entry.id, linkId);
      await loadLinks();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось удалить связь."));
    }
  }

  return (
    <section className={className}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4" />
        Связанные записи
      </div>

      {error ? <Notice variant="error">{error}</Notice> : null}
      {isLoading ? <p className="text-xs text-muted-foreground">Загрузка связей…</p> : null}

      {linkedEntries.length === 0 && !isLoading ? (
        <p className="text-xs text-muted-foreground">Связей пока нет.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {linkedEntries.map((linked) => {
            const link = links.find(
              (item) =>
                (item.source_entry_id === entry.id && item.target_entry_id === linked.id) ||
                (item.target_entry_id === entry.id && item.source_entry_id === linked.id),
            );
            return (
              <li key={linked.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5">
                <Link href={entryModuleHref(linked)} className="min-w-0 truncate text-sm hover:underline">
                  {linked.title || "Без названия"} · {formatEntryType(linked.type)}
                </Link>
                {link ? (
                  <Button type="button" size="icon" variant="ghost" onClick={() => void removeLink(link.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <FieldGroup className="grid gap-2">
        <Field>
          <FieldLabel htmlFor={`entry-link-search-${entry.id}`}>Найти запись</FieldLabel>
          <Input
            id={`entry-link-search-${entry.id}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`entry-link-target-${entry.id}`}>Запись</FieldLabel>
          <Select
            id={`entry-link-target-${entry.id}`}
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            <option value="">Выберите запись</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title || candidate.content.slice(0, 40)} ({formatEntryType(candidate.type)})
              </option>
            ))}
          </Select>
        </Field>
        <Button type="button" size="sm" variant="outline" disabled={!targetId} onClick={() => void addLink()}>
          <Plus data-icon="inline-start" className="size-3.5" />
          Добавить связь
        </Button>
      </FieldGroup>
    </section>
  );
}
