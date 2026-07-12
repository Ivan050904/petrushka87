"use client";

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Empty } from "@/components/ui/empty";
import { bodyWeightProgressPoints, formatChartDate, type ProgressPoint } from "@/lib/workouts";

type BodyWeightPoint = ReturnType<typeof bodyWeightProgressPoints>[number];

export function BodyWeightChart({
  data,
  heightClassName = "h-56",
}: {
  data: BodyWeightPoint[];
  heightClassName?: string;
}) {
  if (data.length === 0) {
    return <Empty title="Нет данных о весе тела" description="Заполни вес при начале тренировки." />;
  }

  const chartData = data.map((point) => ({
    date: formatChartDate(point.date),
    bodyWeight: point.body_weight,
  }));

  return (
    <div className={`${heightClassName} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={["dataMin - 2", "dataMax + 2"]} unit=" кг" />
          <Tooltip formatter={(value: number) => [`${value} кг`, "Вес тела"]} />
          <Line type="monotone" dataKey="bodyWeight" stroke="hsl(var(--primary))" strokeWidth={2} dot />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProgressWeightChart({
  data,
  emptyLabel,
  heightClassName = "h-56",
}: {
  data: ProgressPoint[];
  emptyLabel: string;
  heightClassName?: string;
}) {
  if (data.length === 0) {
    return <Empty title={emptyLabel} />;
  }

  const chartData = data.map((point) => ({
    date: formatChartDate(point.date),
    maxWeight: point.max_weight,
  }));

  return (
    <div className={`${heightClassName} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value: number) => [`${value} кг`, "Макс. вес"]} />
          <Line type="monotone" dataKey="maxWeight" stroke="hsl(var(--primary))" strokeWidth={2} dot />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LowDataProgressNotice({
  pointCount,
  lastWeight,
  lastDate,
}: {
  pointCount: number;
  lastWeight: number | null;
  lastDate: string | null;
}) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
      <p>Мало данных для графика ({pointCount} {pointCount === 1 ? "тренировка" : "тренировки"}).</p>
      {lastWeight !== null && lastDate ? (
        <p className="mt-1 font-medium text-foreground">
          Последний результат: {lastWeight} кг · {formatChartDate(lastDate)}
        </p>
      ) : null}
    </div>
  );
}
