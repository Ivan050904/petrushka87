import type { QuickCaptureEntryType, QuickEntryType } from "@/features/capture/capture-entry-types";
import { stripCaptureMarkers } from "@/features/capture/capture-parse-utils";
import { resolveCaptureType } from "@/features/capture/capture-type-detector";
import type { FinanceDraft } from "@/features/capture/finance-draft-parser";
import { parseFinanceLine } from "@/features/capture/finance-draft-parser";
import { hasFoodMacros, parseFoodLine, type FoodDraft } from "@/features/capture/food-draft-parser";
import type { CaptureTaskDraft } from "@/features/capture/task-draft-parser";
import { parseQuickTasks } from "@/features/capture/task-draft-parser";
import { addMinutes, parseEntryDate, toDateTimeInputValueFromDate } from "@/lib/agenda";

export type { CaptureTaskDraft as QuickTaskDraft } from "@/features/capture/task-draft-parser";
export {
  aiTaskToCaptureDraft,
  parseCaptureLine,
  parseQuickTasks,
} from "@/features/capture/task-draft-parser";
export type { QuickEntryType, QuickCaptureEntryType } from "@/features/capture/capture-entry-types";
export { quickTypeOptions } from "@/features/capture/capture-entry-types";
export { detectCaptureType, resolveCaptureType } from "@/features/capture/capture-type-detector";

export function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function autoEntryPayload(content: string) {
  return { type: "note" as const, content, metadata: { source: "dashboard_quick_ai" } };
}

export function noteEntryPayload(content: string) {
  return { type: "note" as const, content, metadata: { source: "dashboard_quick_input" } };
}

export function financeDraftToPayload(draft: FinanceDraft) {
  return {
    type: "finance" as const,
    title: draft.title,
    content: draft.description,
    metadata: {
      amount: draft.amount,
      direction: draft.direction,
      currency: draft.currency,
      description: draft.description,
      source: "dashboard_quick_input",
    },
  };
}

export function foodDraftToPayload(draft: FoodDraft) {
  const protein = draft.protein ?? 0;
  const fat = draft.fat ?? 0;
  let carbs = draft.carbs ?? 0;
  let calories = draft.calories ?? protein * 4 + fat * 9 + carbs * 4;

  if (!hasFoodMacros(draft) && draft.calories !== null && draft.calories > 0) {
    carbs = Math.round((draft.calories / 4) * 10) / 10;
    calories = draft.calories;
  }

  const metadata: Record<string, string | number> = {
    entry_date: draft.entryDate,
    input_mode: "direct",
    calories: Math.round(calories * 10) / 10,
    protein: Math.round(protein * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    source: "dashboard_quick_input",
  };

  if (draft.grams !== null && draft.grams > 0) {
    metadata.grams = draft.grams;
  }

  return {
    type: "food" as const,
    title: draft.title,
    content: draft.title,
    metadata,
  };
}

function parseTags(value: string) {
  return uniqueStrings(
    value
      .split(/[,#\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseOptionalPositiveInteger(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function taskDraftToPayload(draft: CaptureTaskDraft, source = "dashboard_quick_input") {
  const plannedDurationMinutes = parseOptionalPositiveInteger(draft.plannedDurationMinutes);
  const scheduledAt = draft.scheduledAt || null;
  let endsAt: string | null = null;

  if (scheduledAt && plannedDurationMinutes) {
    const start = parseEntryDate(scheduledAt);
    if (start) {
      endsAt = toDateTimeInputValueFromDate(addMinutes(start, plannedDurationMinutes));
    }
  }

  return {
    type: "task" as const,
    title: draft.title,
    content: draft.description || draft.title,
    metadata: {
      status: draft.status,
      priority: draft.priority,
      scheduled_at: scheduledAt,
      ends_at: endsAt,
      deadline: draft.deadline || null,
      planned_duration_minutes: plannedDurationMinutes,
      actual_duration_minutes: parseOptionalPositiveInteger(draft.actualDurationMinutes),
      reminder_at: draft.reminderAt || null,
      reminder_text: draft.reminderText || null,
      recurrence: draft.recurrence || null,
      tags: parseTags(draft.tags),
      assignee_name: draft.assigneeName || null,
      source,
    },
  };
}

export type CaptureSavePayload = ReturnType<
  typeof taskDraftToPayload | typeof financeDraftToPayload | typeof foodDraftToPayload | typeof noteEntryPayload
>;

export type CaptureBuildResult =
  | { ok: true; payloads: CaptureSavePayload[]; effectiveType: QuickCaptureEntryType }
  | { ok: false; error: string; effectiveType: QuickCaptureEntryType };

export function buildCapturePayloads(
  quickType: QuickEntryType,
  content: string,
  taskDrafts: CaptureTaskDraft[] = [],
): CaptureBuildResult {
  const raw = content.trim();
  if (!raw) {
    return { ok: false, error: "Добавь текст записи.", effectiveType: "note" };
  }

  const effectiveType = resolveCaptureType(quickType, raw);
  const trimmed = stripCaptureMarkers(raw);

  if (effectiveType === "task") {
    const drafts = taskDrafts.length > 0 ? taskDrafts : parseQuickTasks(trimmed);
    if (drafts.length === 0 || drafts.every((draft) => !draft.title.trim())) {
      return { ok: false, error: "Не получилось распознать задачи.", effectiveType };
    }
    return {
      ok: true,
      effectiveType,
      payloads: drafts.map((draft) => taskDraftToPayload(draft)),
    };
  }

  if (effectiveType === "finance") {
    const draft = parseFinanceLine(trimmed);
    if (draft.amount <= 0) {
      return { ok: false, error: "Укажи сумму операции, например «500 руб кофе».", effectiveType };
    }
    if (!draft.description.trim()) {
      return { ok: false, error: "Добавь описание операции.", effectiveType };
    }
    return { ok: true, effectiveType, payloads: [financeDraftToPayload(draft)] };
  }

  if (effectiveType === "food") {
    const draft = parseFoodLine(trimmed);
    if (!draft.title.trim()) {
      return { ok: false, error: "Укажи название приёма пищи.", effectiveType };
    }
    if (!hasFoodMacros(draft) && !(draft.calories !== null && draft.calories > 0)) {
      return { ok: false, error: "Укажи БЖУ или калории, например «овсянка 50г б45 ж8 у30».", effectiveType };
    }
    return { ok: true, effectiveType, payloads: [foodDraftToPayload(draft)] };
  }

  return { ok: true, effectiveType, payloads: [noteEntryPayload(trimmed)] };
}
