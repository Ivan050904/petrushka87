"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useChartColors } from "@/hooks/use-chart-colors";
import { formatCurrency } from "@/lib/entry-helpers";
import { formatMonthShort } from "@/lib/finance-month";
import type { MonthlyTotal } from "@/lib/finance-aggregates";

type ChartPoint = MonthlyTotal & {
  label: string;
};

const Y_AXIS_STEP = 20_000;

function formatAxisTick(value: number) {
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 0 }).format(value);
}

function buildYAxisConfig(data: ChartPoint[]) {
  let min = 0;
  let max = 0;

  for (const item of data) {
    min = Math.min(min, item.expense, item.income, item.balance);
    max = Math.max(max, item.expense, item.income, item.balance);
  }

  const tickMin = Math.floor(min / Y_AXIS_STEP) * Y_AXIS_STEP;
  const tickMax = Math.ceil(max / Y_AXIS_STEP) * Y_AXIS_STEP;
  const ticks: number[] = [];

  for (let value = tickMin; value <= tickMax; value += Y_AXIS_STEP) {
    ticks.push(value);
  }

  if (ticks.length === 0) {
    ticks.push(0);
  }

  return {
    ticks,
    domain: [tickMin, tickMax] as [number, number],
  };
}

function formatTooltipValue(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  return formatCurrency(amount, "RUB");
}

export function FinanceTrendChart({ data }: { data: MonthlyTotal[] }) {
  const colors = useChartColors();
  const chartData: ChartPoint[] = data.map((item) => ({
    ...item,
    label: formatMonthShort(item.month),
  }));

  if (chartData.every((item) => item.income === 0 && item.expense === 0)) {
    return <p className="text-sm text-muted-foreground">Недостаточно данных для тренда.</p>;
  }

  const yAxis = buildYAxisConfig(chartData);
  const chartHeight = Math.min(360, Math.max(240, yAxis.ticks.length * 18));

  return (
    <div className="w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            width={56}
            ticks={yAxis.ticks}
            domain={yAxis.domain}
            tickFormatter={formatAxisTick}
            interval={0}
          />
          <Tooltip formatter={formatTooltipValue} labelFormatter={(label) => `Месяц: ${label}`} />
          <Legend />
          <Line type="monotone" dataKey="expense" name="Расход" stroke={colors.expense} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="income" name="Доход" stroke={colors.income} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="balance" name="Разница" stroke={colors.balance} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
