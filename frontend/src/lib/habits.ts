import type { Entry } from "@/lib/types";

export type HabitStage = "desired" | "tracking" | "automatic" | "archived";
export type HabitRegularityKind = "daily" | "weekdays" | "weekly_target" | "monthly_target";
export type HabitLogStatus = "done" | "skip" | "rest";
export type HabitRangeDays = 7 | 30 | 90 | 365;

export type HabitRegularity = {
  kind: HabitRegularityKind;
  weekdays: number[];
  target: number | null;
};

export type HabitMetadata = {
  stage: HabitStage;
  regularity: HabitRegularity;
  logs: Record<string, HabitLogStatus>;
};

export type HabitHeatmapDay = {
  key: string;
  date: Date;
  status: HabitLogStatus | null;
  scheduled: boolean;
};

export type HabitMetrics = {
  completionRate: number;
  currentStreak: number;
  bestStreak: number;
  doneCount: number;
  heatmap: HabitHeatmapDay[];
};

const habitStages: HabitStage[] = ["desired", "tracking", "automatic", "archived"];
const regularityKinds: HabitRegularityKind[] = ["daily", "weekdays", "weekly_target", "monthly_target"];
const logStatuses: HabitLogStatus[] = ["done", "skip", "rest"];

export function readHabitMetadata(entry: Entry): HabitMetadata {
  return normalizeHabitMetadata(entry.metadata);
}

export function normalizeHabitMetadata(metadata: Record<string, unknown>): HabitMetadata {
  return {
    stage: readOneOf(metadata.stage, habitStages, "desired"),
    regularity: normalizeRegularity(metadata.regularity),
    logs: normalizeLogs(metadata.logs),
  };
}

export function habitMetadataPayload(metadata: HabitMetadata): Record<string, unknown> {
  return {
    stage: metadata.stage,
    regularity:
      metadata.regularity.kind === "weekdays"
        ? { kind: "weekdays", weekdays: metadata.regularity.weekdays }
        : metadata.regularity.kind === "weekly_target" || metadata.regularity.kind === "monthly_target"
          ? { kind: metadata.regularity.kind, target: metadata.regularity.target }
          : { kind: "daily" },
    logs: metadata.logs,
  };
}

export function setHabitLog(metadata: HabitMetadata, key: string, status: HabitLogStatus | null): HabitMetadata {
  const logs = { ...metadata.logs };
  if (status) {
    logs[key] = status;
  } else {
    delete logs[key];
  }
  return { ...metadata, logs };
}

export function habitMetrics(metadata: HabitMetadata, rangeDays: HabitRangeDays, today = new Date()): HabitMetrics {
  const heatmap = rangeDateKeys(rangeDays, today).map(({ key, date }) => ({
    key,
    date,
    status: metadata.logs[key] ?? null,
    scheduled: isScheduledOnDate(metadata.regularity, date),
  }));

  const doneCount = heatmap.filter((day) => day.status === "done").length;
  const completionRate = completionRateForRange(metadata, heatmap, today);
  const streaks = metadata.regularity.kind === "weekly_target" || metadata.regularity.kind === "monthly_target"
    ? periodStreaks(metadata, today)
    : dayStreaks(metadata, today);

  return {
    completionRate,
    currentStreak: streaks.current,
    bestStreak: streaks.best,
    doneCount,
    heatmap,
  };
}

export function habitRegularityLabel(regularity: HabitRegularity) {
  if (regularity.kind === "weekdays") {
    return regularity.weekdays.map(weekdayShortLabel).join(", ");
  }
  if (regularity.kind === "weekly_target") {
    return `${regularity.target ?? 0} раз в неделю`;
  }
  if (regularity.kind === "monthly_target") {
    return `${regularity.target ?? 0} раз в месяц`;
  }
  return "Ежедневно";
}

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function weekdayShortLabel(day: number) {
  return ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"][day] ?? String(day);
}

function completionRateForRange(metadata: HabitMetadata, heatmap: HabitHeatmapDay[], today: Date) {
  if (metadata.regularity.kind === "weekly_target" || metadata.regularity.kind === "monthly_target") {
    return targetCompletionRate(metadata, heatmap, today);
  }

  const todayKey = formatDateKey(today);
  const scored = heatmap.filter((day) => {
    if (!day.scheduled || day.status === "skip" || day.status === "rest") {
      return false;
    }
    return day.key !== todayKey || day.status === "done";
  });
  if (scored.length === 0) {
    return 0;
  }
  return Math.round((scored.filter((day) => day.status === "done").length / scored.length) * 100);
}

function targetCompletionRate(metadata: HabitMetadata, heatmap: HabitHeatmapDay[], today: Date) {
  const groups = groupByPeriod(heatmap, metadata.regularity.kind);
  let done = 0;
  let target = 0;

  for (const days of groups.values()) {
    const doneInPeriod = days.filter((day) => day.status === "done").length;
    const periodTarget = metadata.regularity.target ?? 1;
    const isCurrent = samePeriod(days[days.length - 1].date, today, metadata.regularity.kind);
    done += doneInPeriod;
    target += isCurrent && doneInPeriod < periodTarget ? doneInPeriod : periodTarget;
  }

  return target > 0 ? Math.round((Math.min(done, target) / target) * 100) : 0;
}

function dayStreaks(metadata: HabitMetadata, today: Date) {
  const dates = rangeFromEarliestLog(metadata, today).filter((date) => isScheduledOnDate(metadata.regularity, date));
  let current = 0;
  let best = 0;
  let run = 0;

  for (const date of dates) {
    const status = metadata.logs[formatDateKey(date)] ?? null;
    if (status === "done") {
      run += 1;
      best = Math.max(best, run);
    } else if (status !== "skip" && status !== "rest") {
      run = 0;
    }
  }

  for (let index = dates.length - 1; index >= 0; index -= 1) {
    const key = formatDateKey(dates[index]);
    const status = metadata.logs[key] ?? null;
    if (key === formatDateKey(today) && !status) {
      continue;
    }
    if (status === "done") {
      current += 1;
      continue;
    }
    if (status === "skip" || status === "rest") {
      continue;
    }
    break;
  }

  return { current, best };
}

function periodStreaks(metadata: HabitMetadata, today: Date) {
  const kind = metadata.regularity.kind;
  const target = metadata.regularity.target ?? 1;
  const dates = rangeFromEarliestLog(metadata, today);
  const periods = Array.from(groupByPeriod(dates.map((date) => ({
    key: formatDateKey(date),
    date,
    status: metadata.logs[formatDateKey(date)] ?? null,
    scheduled: true,
  })), kind).values());

  let best = 0;
  let run = 0;
  for (const days of periods) {
    const achieved = days.filter((day) => day.status === "done").length >= target;
    if (achieved) {
      run += 1;
      best = Math.max(best, run);
    } else if (!samePeriod(days[days.length - 1].date, today, kind)) {
      run = 0;
    }
  }

  let current = 0;
  for (let index = periods.length - 1; index >= 0; index -= 1) {
    const days = periods[index];
    const achieved = days.filter((day) => day.status === "done").length >= target;
    if (!achieved && samePeriod(days[days.length - 1].date, today, kind)) {
      continue;
    }
    if (!achieved) {
      break;
    }
    current += 1;
  }

  return { current, best };
}

function normalizeRegularity(value: unknown): HabitRegularity {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const kind = readOneOf(source.kind, regularityKinds, "daily");
  if (kind === "weekdays") {
    const weekdays = Array.isArray(source.weekdays)
      ? Array.from(new Set(source.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7))).sort()
      : [];
    return { kind, weekdays: weekdays.length > 0 ? weekdays : [1, 2, 3, 4, 5], target: null };
  }
  if (kind === "weekly_target") {
    return { kind, weekdays: [], target: clampInteger(source.target, 1, 7, 3) };
  }
  if (kind === "monthly_target") {
    return { kind, weekdays: [], target: clampInteger(source.target, 1, 31, 10) };
  }
  return { kind: "daily", weekdays: [], target: null };
}

function normalizeLogs(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, status]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && logStatuses.includes(status as HabitLogStatus),
    ),
  ) as Record<string, HabitLogStatus>;
}

function readOneOf<T extends string>(value: unknown, allowed: T[], fallback: T) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function isScheduledOnDate(regularity: HabitRegularity, date: Date) {
  if (regularity.kind === "weekdays") {
    return regularity.weekdays.includes(isoWeekday(date));
  }
  return true;
}

function rangeDateKeys(days: number, today: Date) {
  const end = startOfDay(today);
  return Array.from({ length: days }).map((_, index) => {
    const date = addDays(end, index - days + 1);
    return { key: formatDateKey(date), date };
  });
}

function rangeFromEarliestLog(metadata: HabitMetadata, today: Date) {
  const keys = Object.keys(metadata.logs).sort();
  const first = keys[0] ? parseDateKey(keys[0]) : addDays(startOfDay(today), -30);
  const end = startOfDay(today);
  const days = Math.max(1, Math.round((end.getTime() - first.getTime()) / 86400000) + 1);
  return rangeDateKeys(days, today).map((item) => item.date);
}

function groupByPeriod(days: HabitHeatmapDay[], kind: HabitRegularityKind) {
  const groups = new Map<string, HabitHeatmapDay[]>();
  for (const day of days) {
    const key = periodKey(day.date, kind);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return groups;
}

function periodKey(date: Date, kind: HabitRegularityKind) {
  if (kind === "monthly_target") {
    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
  }
  return formatDateKey(addDays(startOfDay(date), 1 - isoWeekday(date)));
}

function samePeriod(left: Date, right: Date, kind: HabitRegularityKind) {
  return periodKey(left, kind) === periodKey(right, kind);
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoWeekday(date: Date) {
  return ((date.getDay() + 6) % 7) + 1;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
