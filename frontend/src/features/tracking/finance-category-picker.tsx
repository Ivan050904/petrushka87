"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { List } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function filterCategories(categories: string[], query: string, limit?: number) {
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? categories.filter((category) => category.toLowerCase().includes(normalized))
    : categories;
  return limit ? filtered.slice(0, limit) : filtered;
}

type FinanceCategoryComboboxProps = {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
  onBrowseAll?: () => void;
  onCreateCategory?: () => void;
  placeholder?: string;
  className?: string;
};

export function FinanceCategoryCombobox({
  value,
  categories,
  onChange,
  onBrowseAll,
  onCreateCategory,
  placeholder = "Начните вводить...",
  className,
}: FinanceCategoryComboboxProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const matches = useMemo(() => filterCategories(categories, query, 12), [categories, query]);

  function commitValue(next: string) {
    const trimmed = next.trim();
    setQuery(trimmed);
    onChange(trimmed);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className={cn("relative flex min-w-[9rem] items-center gap-1", className)}>
      <Input
        value={query}
        placeholder={placeholder}
        onFocus={() => {
          setIsOpen(true);
          onBrowseAll?.();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (matches[0]) {
              commitValue(matches[0]);
              return;
            }
            commitValue(query);
          }
          if (event.key === "Escape") {
            setIsOpen(false);
            setQuery(value);
          }
        }}
        className="min-w-0 flex-1"
      />
      {onBrowseAll ? (
        <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" title="Все категории" onClick={onBrowseAll}>
          <List className="size-4" />
        </Button>
      ) : null}

      {isOpen && query.trim() ? (
        <ul className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full min-w-[12rem] overflow-auto rounded-md border border-border bg-card py-1 shadow-md">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">Совпадений нет</li>
          ) : (
            matches.map((category) => (
              <li key={category}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitValue(category)}
                >
                  {category}
                </button>
              </li>
            ))
          )}
          {onCreateCategory ? (
            <li className="border-t border-border">
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-primary hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setIsOpen(false);
                  onCreateCategory();
                }}
              >
                + Создать категорию
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

type FinanceCategoryPanelProps = {
  categories: string[];
  activeLabel?: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (category: string) => void;
  onCreateCategory?: () => void;
  className?: string;
};

export function FinanceCategoryPanel({
  categories,
  activeLabel,
  query,
  onQueryChange,
  onSelect,
  onCreateCategory,
  className,
}: FinanceCategoryPanelProps) {
  const filtered = useMemo(() => filterCategories(categories, query), [categories, query]);

  return (
    <aside
      className={cn(
        "flex max-h-[calc(100vh-12rem)] flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-sm",
        className,
      )}
    >
      <div>
        <h3 className="text-sm font-medium">Все категории</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {activeLabel ? `Для: ${activeLabel}` : "Кликните поле «Категория» в строке таблицы"}
        </p>
      </div>

      <Input
        value={query}
        placeholder="Поиск категории..."
        onChange={(event) => onQueryChange(event.target.value)}
      />

      <ul className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">Категории не найдены</li>
        ) : (
          filtered.map((category) => (
            <li key={category} className="border-b border-border last:border-b-0">
              <button
                type="button"
                disabled={!activeLabel}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm transition hover:bg-muted",
                  !activeLabel && "cursor-not-allowed opacity-50",
                )}
                onClick={() => onSelect(category)}
              >
                {category}
              </button>
            </li>
          ))
        )}
      </ul>

      {onCreateCategory ? (
        <Button type="button" variant="outline" size="sm" onClick={onCreateCategory}>
          + Создать категорию
        </Button>
      ) : null}

      <p className="text-xs text-muted-foreground">{filtered.length} из {categories.length}</p>
    </aside>
  );
}
