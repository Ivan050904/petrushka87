"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useChartColors } from "@/hooks/use-chart-colors";
import { formatCurrency } from "@/lib/entry-helpers";
import type { DailyExpense } from "@/lib/finance-aggregates";
import { currentMonthValue } from "@/lib/finance-month";

function formatTooltipValue(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  return formatCurrency(amount, "RUB");
}

export function FinanceDailyChart({
  data,
  month,
}: {
  data: DailyExpense[];
  month: string;
}) {
  const colors = useChartColors();
  const today = new Date().getDate();
  const highlightToday = month === currentMonthValue();

  if (data.every((item) => item.total === 0)) {
    return <p className="text-sm text-muted-foreground">В этом месяце пока нет расходов.</p>;
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 12 }}
            width={72}
            tickFormatter={(value) =>
              new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))
            }
          />
          <Tooltip formatter={formatTooltipValue} labelFormatter={(label) => `День ${label}`} />
          <Bar dataKey="total" name="Расход" radius={[3, 3, 0, 0]}>
            {data.map((item) => (
              <Cell
                key={item.day}
                fill={highlightToday && item.day === today ? colors.primary : colors.bar}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
