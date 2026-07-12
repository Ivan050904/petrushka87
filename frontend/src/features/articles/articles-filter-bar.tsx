"use client";

import { Search } from "lucide-react";

import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TIER_LABELS, type ArticlesTab, type PsychTierFilter } from "@/features/articles/articles-helpers";
import { cn } from "@/lib/utils";

type ArticlesFilterBarProps = {
  tab: ArticlesTab;
  query: string;
  onQueryChange: (value: string) => void;
  topicFilter: string;
  onTopicChange: (value: string) => void;
  topicOptions: string[];
  tierFilter: PsychTierFilter;
  onTierChange: (value: PsychTierFilter) => void;
};

export function ArticlesFilterBar({
  tab,
  query,
  onQueryChange,
  topicFilter,
  onTopicChange,
  topicOptions,
  tierFilter,
  onTierChange,
}: ArticlesFilterBarProps) {
  const tierOptions: Array<{ value: PsychTierFilter; label: string }> = [
    { value: "all", label: "Все уровни" },
    { value: "guides", label: TIER_LABELS.guides },
    { value: "popsci", label: TIER_LABELS.popsci },
    { value: "science", label: TIER_LABELS.science },
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <FieldLabel htmlFor="articles-search" className="sr-only">
          Поиск статей
        </FieldLabel>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--articles-muted)]" />
        <Input
          id="articles-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Поиск по заголовку, описанию или ссылке"
          className="articles-toolbar-input pl-9"
        />
      </div>

      {tab === "psychology" ? (
        <div className="flex flex-wrap gap-2">
          {tierOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTierChange(option.value)}
              className={cn(
                "articles-chip focus-ring",
                tierFilter === option.value && "articles-chip-active",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : topicOptions.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {topicOptions.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => onTopicChange(topic)}
              className={cn(
                "articles-chip focus-ring max-w-full truncate",
                topicFilter === topic && "articles-chip-active",
              )}
            >
              {topic === "all" ? "Все темы" : topic}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
