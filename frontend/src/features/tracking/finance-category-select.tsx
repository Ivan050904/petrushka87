"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  addFinanceCategory,
  loadFinanceCategories,
  suggestCategory,
} from "@/features/tracking/finance-categories";

type FinanceCategorySelectProps = {
  userId: string | undefined;
  value: string;
  onChange: (value: string) => void;
  extraCategories?: string[];
  suggestion?: {
    title?: string;
    rawDescription?: string;
    bankCategory?: string | null;
  };
  id?: string;
};

export function FinanceCategorySelect({
  userId,
  value,
  onChange,
  extraCategories = [],
  suggestion,
  id,
}: FinanceCategorySelectProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    setCategories(loadFinanceCategories(userId));
    setIsMounted(true);
  }, [userId]);

  const suggested = useMemo(() => (suggestion ? suggestCategory(suggestion) : null), [suggestion]);
  const options = useMemo(() => {
    const merged = new Set(categories);
    for (const category of extraCategories) {
      if (category.trim()) {
        merged.add(category.trim());
      }
    }
    if (value.trim()) {
      merged.add(value.trim());
    }
    if (suggested) {
      merged.add(suggested);
    }
    return [...merged].sort((left, right) => left.localeCompare(right, "ru"));
  }, [categories, extraCategories, suggested, value]);

  function handleAddCategory() {
    if (!userId) {
      return;
    }
    const next = addFinanceCategory(userId, newCategory);
    setCategories(next);
    onChange(newCategory.trim());
    setNewCategory("");
    setIsAdding(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Без категории</option>
        {options.map((category) => (
          <option key={category} value={category}>
            {category}
            {isMounted && category === suggested && category !== value ? " (предложено)" : ""}
          </option>
        ))}
      </Select>
      {isAdding ? (
        <div className="flex items-center gap-2">
          <Input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="Новая категория"
          />
          <Button type="button" size="sm" onClick={handleAddCategory} disabled={!newCategory.trim()}>
            Добавить
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
            Отмена
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => setIsAdding(true)}>
          + Добавить категорию
        </Button>
      )}
    </div>
  );
}
