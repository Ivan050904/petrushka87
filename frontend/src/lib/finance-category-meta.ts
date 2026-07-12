import type { LucideIcon } from "lucide-react";
import {
  Car,
  Circle,
  Heart,
  Home,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Wallet,
} from "lucide-react";

export type FinanceCategoryMeta = {
  icon: LucideIcon;
  color: string;
  barColor: string;
};

const CATEGORY_META: Record<string, FinanceCategoryMeta> = {
  Продукты: { icon: ShoppingCart, color: "text-emerald-600", barColor: "bg-emerald-500" },
  Еда: { icon: ShoppingCart, color: "text-emerald-600", barColor: "bg-emerald-500" },
  Транспорт: { icon: Car, color: "text-sky-600", barColor: "bg-sky-500" },
  Рестораны: { icon: Utensils, color: "text-orange-600", barColor: "bg-orange-500" },
  Подписки: { icon: Repeat, color: "text-violet-600", barColor: "bg-violet-500" },
  Жильё: { icon: Home, color: "text-amber-600", barColor: "bg-amber-500" },
  Коммунальные: { icon: Home, color: "text-amber-600", barColor: "bg-amber-500" },
  Здоровье: { icon: Heart, color: "text-rose-600", barColor: "bg-rose-500" },
  Покупки: { icon: ShoppingBag, color: "text-indigo-600", barColor: "bg-indigo-500" },
  Переводы: { icon: Wallet, color: "text-slate-600", barColor: "bg-slate-400" },
  Прочее: { icon: Circle, color: "text-muted-foreground", barColor: "bg-muted-foreground" },
};

const DONUT_PALETTE = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

export function getFinanceCategoryMeta(category: string): FinanceCategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META["Прочее"];
}

export function getDonutColor(index: number): string {
  return DONUT_PALETTE[index % DONUT_PALETTE.length];
}

export function computeCategoryDelta(current: number, compare: number): {
  percent: number | null;
  label: string;
  trend: "up" | "down" | "flat" | "new";
} {
  if (compare <= 0 && current > 0) {
    return { percent: null, label: "новая", trend: "new" };
  }
  if (compare <= 0 && current <= 0) {
    return { percent: 0, label: "0%", trend: "flat" };
  }
  const percent = Math.round(((current - compare) / compare) * 100);
  if (percent === 0) {
    return { percent: 0, label: "0%", trend: "flat" };
  }
  if (percent > 0) {
    return { percent, label: `+${percent}%`, trend: "up" };
  }
  return { percent, label: `${percent}%`, trend: "down" };
}

export function computeKpiDelta(current: number, compare: number): string | null {
  if (compare <= 0) {
    return null;
  }
  const percent = Math.round(((current - compare) / compare) * 100);
  if (percent === 0) {
    return "0%";
  }
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

export type KpiKind = "expense" | "income" | "balance";

export type KpiDeltaMeta = {
  label: string | null;
  sentiment: "good" | "bad" | "neutral";
};

export function computeKpiDeltaMeta(kind: KpiKind, current: number, compare: number): KpiDeltaMeta {
  const label = computeKpiDelta(current, compare);
  if (!label || label === "0%") {
    return { label, sentiment: "neutral" };
  }

  const increased = current > compare;
  if (kind === "expense") {
    return { label, sentiment: increased ? "bad" : "good" };
  }
  return { label, sentiment: increased ? "good" : "bad" };
}
