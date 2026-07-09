import type { Entry } from "@/lib/types";
import { journalHref, plansHref, referenceHref, trackingHref } from "@/lib/navigation";

export function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function getNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "Без даты";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatCurrency(amount: number, currency: string) {
  const currencyCode = currency || "RUB";
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount)} ${currencyCode}`;
  }
}

export function entryDescription(entry: Entry) {
  return getString(entry.metadata.description) || entry.content;
}

export function entryModuleHref(entry: Entry) {
  switch (entry.type) {
    case "task":
      return plansHref({ tab: "tasks", selected: entry.id });
    case "event":
      return plansHref({ tab: "events", selected: entry.id });
    case "reminder":
      return plansHref({ tab: "reminders", selected: entry.id });
    case "habit":
      return trackingHref({ tab: "habits", selected: entry.id });
    case "finance":
      return trackingHref({ tab: "finance", selected: entry.id });
    case "food":
      return trackingHref({ tab: "food", selected: entry.id });
    case "person":
      return referenceHref({ tab: "people", selected: entry.id });
    case "resource":
      return referenceHref({ tab: "resources", selected: entry.id });
    case "diary":
    case "note":
      return journalHref(entry.id);
    default:
      return `/search?q=${encodeURIComponent(entry.title)}`;
  }
}
