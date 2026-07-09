"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { NutritionTargets } from "@/lib/food-tracking";
import {
  buildNutritionChartModel,
  formatKcal,
  formatMacroGrams,
  type NutritionChartSegment,
} from "@/lib/nutrition-chart-model";
import type { NutritionSummary } from "@/lib/nutrition-summary";
import { cn } from "@/lib/utils";

const CX = 100;
const CY = 98;
const RADIUS = 70;
const STROKE = 14;

type NutritionArcChartProps = {
  summary: NutritionSummary;
  targets: NutritionTargets;
  className?: string;
  compact?: boolean;
};

export function NutritionArcChart({ summary, targets, className, compact = false }: NutritionArcChartProps) {
  const titleId = useId();
  const descId = useId();
  const model = useMemo(() => buildNutritionChartModel(summary, targets), [summary, targets]);
  const animatedProgress = useAnimatedProgress(
    model.segments.map((segment) => segment.displayProgress),
    summary,
  );
  const animatedCalories = useAnimatedNumber(summary.calories);

  const statusLabel = model.isEmpty
    ? "Записей о еде сегодня пока нет"
    : model.caloriesOver > 0
      ? `Перебор ${Math.round(model.caloriesOver)} килокалорий`
      : model.isCaloriesGoalMet
        ? "Дневная цель по калориям достигнута"
        : `Осталось ${Math.round(model.caloriesLeft)} килокалорий`;

  return (
    <div
      className={cn(
        "relative mx-auto w-full min-w-0 max-w-[280px] overflow-hidden",
        compact ? "min-h-[156px]" : "min-h-[172px]",
        className,
      )}
    >
      <svg
        viewBox="0 0 200 132"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="h-auto w-full"
      >
        <title id={titleId}>
          {model.isEmpty
            ? `КБЖУ сегодня: записей нет. Цель ${formatKcal(targets.calories)}.`
            : `Калории ${Math.round(summary.calories)} из ${targets.calories}. Белки ${Math.round(summary.protein)} из ${targets.protein} грамм, жиры ${Math.round(summary.fat)} из ${targets.fat} грамм, углеводы ${Math.round(summary.carbs)} из ${targets.carbs} грамм.`}
        </title>
        <desc id={descId}>{statusLabel}</desc>

        {model.segments.map((segment, index) => (
          <MacroArc
            key={segment.key}
            segment={segment}
            progress={model.isEmpty ? 0 : (animatedProgress[index] ?? 0)}
            showValue={!model.isEmpty}
            compact={compact}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center px-2 text-center">
        <span
          className={cn(
            "font-semibold tabular-nums leading-none text-foreground",
            compact ? "text-xl" : "text-2xl",
            model.isEmpty && "text-muted-foreground",
          )}
        >
          {animatedCalories}
        </span>
        <span className="mt-1 text-xs text-muted-foreground tabular-nums">{formatKcal(targets.calories)}</span>
        {model.isEmpty ? (
          <span className="mt-1 text-xs text-muted-foreground">Добавьте приём пищи в трекинге</span>
        ) : model.caloriesOver > 0 ? (
          <span className="mt-0.5 text-xs font-medium tabular-nums text-destructive">
            +{Math.round(model.caloriesOver)} кКал
          </span>
        ) : model.isCaloriesGoalMet ? (
          <span className="mt-0.5 text-xs font-medium text-accent">Цель достигнута</span>
        ) : (
          <span className="mt-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            −{Math.round(model.caloriesLeft)} кКал
          </span>
        )}
      </div>
    </div>
  );
}

function MacroArc({
  segment,
  progress,
  showValue,
  compact = false,
}: {
  segment: NutritionChartSegment;
  progress: number;
  showValue: boolean;
  compact?: boolean;
}) {
  const path = describeArc(CX, CY, RADIUS, segment.startAngle, segment.endAngle);
  const midAngle = (segment.startAngle + segment.endAngle) / 2;
  const labelPoint = polarToXY(CX, CY, RADIUS + 16, midAngle);
  const showOuterLabel = !compact && segment.spanDeg >= 14;
  const showValueLabel = !compact && showValue && segment.spanDeg >= 18 && progress >= 0.1;
  const valuePoint = polarToXY(CX, CY, RADIUS - 1, lerpAngle(segment.startAngle, segment.endAngle, progress * 0.5));

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={segment.trackColor}
        strokeWidth={STROKE}
        strokeLinecap="round"
        pathLength={1}
      />
      {progress > 0 ? (
        <path
          d={path}
          fill="none"
          stroke={segment.isOver ? undefined : segment.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${progress} ${Math.max(0.001, 1 - progress)}`}
          className={cn("nutrition-arc-progress", segment.isOver && "stroke-destructive")}
        />
      ) : null}
      {showOuterLabel ? (
        <>
          <text
            x={labelPoint.x}
            y={labelPoint.y - 4}
            textAnchor="middle"
            className="fill-muted-foreground text-[8px] font-medium uppercase tracking-wide"
          >
            {segment.label}
          </text>
          <text
            x={labelPoint.x}
            y={labelPoint.y + 6}
            textAnchor="middle"
            className="fill-foreground text-[9px] font-semibold tabular-nums"
          >
            {formatMacroGrams(segment.target)}
          </text>
        </>
      ) : null}
      {showValueLabel ? (
        <text
          x={valuePoint.x}
          y={valuePoint.y + 3}
          textAnchor="middle"
          className={cn(
            "text-[9px] font-semibold tabular-nums",
            segment.isOver ? "fill-destructive" : "fill-foreground",
          )}
        >
          {formatMacroGrams(segment.value)}
        </text>
      ) : null}
    </g>
  );
}

function polarToXY(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy - radius * Math.sin(rad),
  };
}

function lerpAngle(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToXY(cx, cy, radius, startAngle);
  const end = polarToXY(cx, cy, radius, endAngle);
  const span = Math.abs(startAngle - endAngle);
  const largeArc = span > 180 ? 1 : 0;

  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function useAnimatedProgress(targets: number[], summary: NutritionSummary) {
  const [values, setValues] = useState(() => targets.map(() => 0));
  const valuesRef = useRef(values);
  const signature = `${summary.calories}-${summary.protein}-${summary.fat}-${summary.carbs}-${targets.join(",")}`;

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValues(targets);
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setValues(targets);
      return;
    }

    const from = valuesRef.current;
    const start = performance.now();
    const duration = 780;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValues(targets.map((target, index) => from[index] + (target - from[index]) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [signature, targets]);

  return values;
}

function useAnimatedNumber(target: number) {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValue(Math.round(target));
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setValue(Math.round(target));
      return;
    }

    let frame = 0;
    const from = valueRef.current;
    const start = performance.now();
    const duration = 680;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}
