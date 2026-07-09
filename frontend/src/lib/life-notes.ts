import type { Entry } from "@/lib/types";

export const LIFE_NOTES_COLLECTION = "life_notes";
export const DEFAULT_LIFE_NOTE_CATEGORY = "Жизнь Ванечки";
export const LIFE_NOTES_PAGE_SIZE = 100;

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ru-RU", { weekday: "long" });
const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

export type LifeNoteEmotionReview = {
  tone: string;
  dry_spots: Array<{
    quote: string;
    issue: string;
    suggestion: string;
  }>;
  summary: string;
  reviewed_at?: string;
  usage?: Record<string, unknown>;
};

export function isLifeNote(entry: Entry) {
  return entry.type === "diary" && entry.metadata.collection === LIFE_NOTES_COLLECTION;
}

export function getLifeNoteEntryDate(entry: Entry) {
  const value = entry.metadata.entry_date;
  return typeof value === "string" && value ? value : entry.created_at.slice(0, 10);
}

export function getLifeNoteCategory(entry: Entry) {
  const value = entry.metadata.category;
  return typeof value === "string" && value.trim() ? value : DEFAULT_LIFE_NOTE_CATEGORY;
}

export function formatLifeNoteCardTitle(entryDate: string) {
  const date = new Date(`${entryDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return entryDate;
  }
  const dayMonth = DAY_MONTH_FORMATTER.format(date);
  const weekday = WEEKDAY_FORMATTER.format(date);
  return `${dayMonth} ${weekday}`;
}

export function formatLifeNoteTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatLifeNoteShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return formatLifeNoteTime(value);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function lifeNotePreview(content: string, maxLines = 4) {
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
}

export function buildLifeNoteMetadata(options?: {
  entryDate?: string;
  category?: string;
}) {
  const entryDate = options?.entryDate ?? new Date().toISOString().slice(0, 10);
  return {
    mode: "diary" as const,
    entry_date: entryDate,
    collection: LIFE_NOTES_COLLECTION,
    category: options?.category ?? DEFAULT_LIFE_NOTE_CATEGORY,
  };
}

export function buildLifeNoteTitle(entryDate: string) {
  return formatLifeNoteCardTitle(entryDate);
}

export function getLifeNoteDisplayTitle(entry: Entry) {
  const customTitle = entry.title.trim();
  if (!customTitle) {
    return formatLifeNoteCardTitle(getLifeNoteEntryDate(entry));
  }
  const autoTitle = formatLifeNoteCardTitle(getLifeNoteEntryDate(entry));
  if (customTitle === autoTitle) {
    return autoTitle;
  }
  return customTitle;
}

export function getEditableLifeNoteTitle(entry: Entry | null | undefined) {
  if (!entry) {
    return "";
  }
  const customTitle = entry.title.trim();
  if (!customTitle) {
    return "";
  }
  if (customTitle === formatLifeNoteCardTitle(getLifeNoteEntryDate(entry))) {
    return "";
  }
  return customTitle;
}

export function getStoredEmotionReview(entry: Entry): LifeNoteEmotionReview | null {
  const value = entry.metadata.ai_emotion_review;
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as LifeNoteEmotionReview;
}
