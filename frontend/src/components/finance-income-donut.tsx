"use client";

import { useId, useMemo } from "react";

import { formatCurrency } from "@/lib/entry-helpers";
import { getDonutColor, getFinanceCategoryMeta } from "@/lib/finance-category-meta";
import { cn } from "@/lib/utils";

type IncomeSlice = {
  category: string;
  total: number;
};

const SIZE = 160;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 58;
const STROKE = 22;

function polarToCartesian(angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: CX + RADIUS * Math.cos(rad),
    y: CY + RADIUS * Math.sin(rad),
  };
}

function describeArc(startAngle: number, endAngle: number) {
  const start = polarToCartesian(endAngle);
  const end = polarToCartesian(startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function FinanceIncomeDonut({
  items,
  total,
  className,
  selectedCategory,
  onCategoryClick,
}: {
  items: IncomeSlice[];
  total: number;
  className?: string;
  selectedCategory?: string | null;
  onCategoryClick?: (category: string) => void;
}) {
  const titleId = useId();

  const slices = useMemo(() => {
    if (total <= 0) {
      return [];
    }
    let cursor = 0;
    return items.map((item, index) => {
      const angle = (item.total / total) * 360;
      const start = cursor;
      const end = cursor + angle;
      cursor = end;
      return {
        ...item,
        start,
        end,
        color: getDonutColor(index),
        percent: Math.round((item.total / total) * 100),
      };
    });
  }, [items, total]);

  if (items.length === 0 || total <= 0) {
    return <p className="text-sm text-muted-foreground">В этом месяце нет доходов.</p>;
  }

  return (
    <div className={cn("flex flex-col items-center gap-4 lg:flex-row lg:items-start", className)}>
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} role="img" aria-labelledby={titleId}>
          <title id={titleId}>Доходы по категориям</title>
          <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-muted/40" />
          {slices.map((slice) => (
            <path
              key={slice.category}
              d={describeArc(slice.start, slice.end)}
              fill="none"
              stroke={slice.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">Всего</span>
          <span className="font-mono text-sm font-semibold">{formatCurrency(total, "RUB")}</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2">
        {slices.map((slice) => {
          const meta = getFinanceCategoryMeta(slice.category);
          const Icon = meta.icon;
          const isSelected = selectedCategory === slice.category;
          return (
            <li key={slice.category}>
              <button
                type="button"
                onClick={() => onCategoryClick?.(slice.category)}
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-sm transition",
                  onCategoryClick && "focus-ring hover:bg-muted/60",
                  isSelected && "bg-primary/5 ring-2 ring-primary/40",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden="true" />
                  <Icon className={cn("size-3.5 shrink-0", meta.color)} aria-hidden="true" />
                  <span className="truncate">{slice.category}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-mono font-medium">{formatCurrency(slice.total, "RUB")}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{slice.percent}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
