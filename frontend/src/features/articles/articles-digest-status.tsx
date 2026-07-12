"use client";

import { formatDate } from "@/lib/entry-helpers";
import type { DigestProfileStatus, DigestStatus } from "@/lib/api";
import { QUERY_SOURCE_LABELS, type ArticlesTab } from "@/features/articles/articles-helpers";

type ArticlesDigestStatusProps = {
  tab: ArticlesTab;
  status: DigestStatus | null;
  profileStatus: DigestProfileStatus | null;
};

export function ArticlesDigestStatus({ tab, status, profileStatus }: ArticlesDigestStatusProps) {
  if (!profileStatus) {
    return null;
  }

  const chips = [
    {
      label: "Обновлено",
      value: profileStatus.last_run_at ? formatDate(profileStatus.last_run_at) : "ещё не было",
    },
    {
      label: "Следующий поиск",
      value: profileStatus.next_search_from
        ? `с ${formatDate(profileStatus.next_search_from)}`
        : "актуально на сегодня",
    },
    {
      label: "Авто",
      value: status?.scheduler_enabled ? `каждый день в ${status.schedule_hour}:00` : "выключено",
    },
  ];

  if (tab === "psychology" && profileStatus.query_source) {
    chips.push({
      label: "Запросы",
      value: QUERY_SOURCE_LABELS[profileStatus.query_source] ?? profileStatus.query_source,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span key={chip.label} className="articles-chip">
          <span className="text-[var(--articles-muted)]">{chip.label}:</span>
          <span className="text-[var(--articles-foreground)]">{chip.value}</span>
        </span>
      ))}
      {tab === "psychology" && profileStatus.last_error ? (
        <span className="articles-chip border-rose-500/40 text-rose-300">{profileStatus.last_error}</span>
      ) : null}
    </div>
  );
}
