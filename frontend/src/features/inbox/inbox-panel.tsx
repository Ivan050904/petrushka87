"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Notice } from "@/components/ui/notice";
import {
  INBOX_GROUP_LABELS,
  filterInboxEntries,
  inboxGroup,
  type InboxGroup,
} from "@/features/inbox/inbox-helpers";
import { useRequireAuth } from "@/hooks/use-auth";
import { deleteEntry, getErrorMessage, listEntries, updateEntry } from "@/lib/api";
import { formatDate, getString } from "@/lib/entry-helpers";
import { formatEntryType } from "@/lib/labels";
import { journalHref, plansHref } from "@/lib/navigation";
import type { Entry } from "@/lib/types";

export function InboxPanel() {
  const { token } = useRequireAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listEntries(token, { limit: 100 });
      setEntries(result.items);
    } catch (requestError) {
      setLoadError(getErrorMessage(requestError, "Не удалось загрузить входящие."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const inboxEntries = useMemo(() => filterInboxEntries(entries), [entries]);

  const grouped = useMemo(() => {
    const groups: Record<InboxGroup, Entry[]> = { tasks: [], reminders: [], notes: [] };
    for (const entry of inboxEntries) {
      groups[inboxGroup(entry)].push(entry);
    }
    return groups;
  }, [inboxEntries]);

  async function activateTask(entry: Entry) {
    if (!token) {
      return;
    }
    setBusyId(entry.id);
    setActionError(null);
    try {
      await updateEntry(token, entry.id, {
        metadata: { ...entry.metadata, status: "active" },
      });
      await loadEntries();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось обновить задачу."));
    } finally {
      setBusyId(null);
    }
  }

  async function completeReminder(entry: Entry) {
    if (!token) {
      return;
    }
    setBusyId(entry.id);
    setActionError(null);
    try {
      await updateEntry(token, entry.id, {
        metadata: { ...entry.metadata, status: "done" },
      });
      await loadEntries();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось закрыть напоминание."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeNote(entry: Entry) {
    if (!token) {
      return;
    }
    setBusyId(entry.id);
    setActionError(null);
    try {
      await deleteEntry(token, entry.id);
      await loadEntries();
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "Не удалось удалить заметку."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-8">Входящие</h1>
        <p className="text-sm text-muted-foreground">Новые задачи, срочные напоминания и свежие заметки для разбора.</p>
      </header>

      {loadError ? <Notice variant="error">{loadError}</Notice> : null}
      {actionError ? <Notice variant="error">{actionError}</Notice> : null}

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-label="Загрузка">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-16 rounded-md bg-muted" />
          ))}
        </div>
      ) : inboxEntries.length === 0 ? (
        <Empty title="Входящие пусты" actionHref="/dashboard" actionLabel="На Сегодня" />
      ) : (
        <div className="flex flex-col gap-6">
          {(Object.keys(grouped) as InboxGroup[]).map((group) => {
            const items = grouped[group];
            if (items.length === 0) {
              return null;
            }
            return (
              <section key={group} className="rounded-md border border-border bg-card shadow-panel">
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <h2 className="text-base font-semibold">{INBOX_GROUP_LABELS[group]}</h2>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
                <div>
                  {items.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{entry.title || entry.content.slice(0, 80)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{formatEntryType(entry.type)}</Badge>
                          <span>{formatDate(entry.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group === "tasks" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === entry.id}
                              onClick={() => void activateTask(entry)}
                            >
                              <CheckCircle2 data-icon="inline-start" />
                              В работу
                            </Button>
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={plansHref({ tab: "tasks", selected: entry.id })}>
                                В планы
                                <ArrowRight data-icon="inline-end" />
                              </Link>
                            </Button>
                          </>
                        ) : null}
                        {group === "reminders" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === entry.id}
                              onClick={() => void completeReminder(entry)}
                            >
                              Готово
                            </Button>
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={plansHref({ tab: "reminders", selected: entry.id })}>В планы</Link>
                            </Button>
                          </>
                        ) : null}
                        {group === "notes" ? (
                          <>
                            <Button size="sm" variant="outline" asChild>
                              <Link href={journalHref(entry.id)}>В журнал</Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyId === entry.id}
                              onClick={() => void removeNote(entry)}
                              aria-label="Удалить заметку"
                            >
                              <Trash2 data-icon />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
