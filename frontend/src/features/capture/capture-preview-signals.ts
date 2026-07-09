import type { FinanceDraft } from "@/features/capture/finance-draft-parser";
import type { FoodDraft } from "@/features/capture/food-draft-parser";
import type { CapturePreviewDraft } from "@/features/capture/capture-preview-items";
import type { QuickCaptureEntryType } from "@/features/capture/capture-entry-types";
import type { CaptureTaskDraft } from "@/features/capture/task-draft-parser";
import { formatCaptureDeadline } from "@/lib/capture-deadline";
import { formatFinanceDirection, formatTaskPriority } from "@/lib/labels";

export type CapturePreviewSignal = {
  label: string;
  strong: boolean;
};

const MAX_PREVIEW_SIGNALS = 2;

export function pickCapturePreviewSignals(
  entryType: QuickCaptureEntryType,
  draft: CapturePreviewDraft,
): CapturePreviewSignal[] {
  if (entryType === "finance") {
    return pickFinanceSignals(draft as FinanceDraft);
  }
  if (entryType === "food") {
    return pickFoodSignals(draft as FoodDraft);
  }
  if (entryType === "note") {
    return [];
  }
  return pickTaskSignals(draft as CaptureTaskDraft);
}

function pickTaskSignals(draft: CaptureTaskDraft): CapturePreviewSignal[] {
  const when = draft.deadline
    ? { label: `до ${formatCaptureDeadline(draft.deadline)}`, strong: false }
    : draft.scheduledAt
      ? { label: formatCaptureDeadline(draft.scheduledAt), strong: true }
      : draft.reminderAt
        ? { label: formatCaptureDeadline(draft.reminderAt), strong: false }
        : null;

  const secondary =
    draft.priority !== "medium"
      ? {
          label: formatTaskPriority(draft.priority),
          strong: draft.priority === "urgent" || draft.priority === "high",
        }
      : draft.assigneeName
        ? { label: `@${draft.assigneeName}`, strong: false }
        : draft.tags
          ? { label: draft.tags.split(",")[0]?.trim() ?? draft.tags, strong: false }
          : null;

  return [when, secondary].filter(Boolean).slice(0, MAX_PREVIEW_SIGNALS) as CapturePreviewSignal[];
}

function pickFinanceSignals(draft: FinanceDraft): CapturePreviewSignal[] {
  const amount =
    draft.amount > 0
      ? {
          label: `${draft.direction === "income" ? "+" : "−"}${draft.amount} ${draft.currency}`,
          strong: true,
        }
      : null;
  const direction = draft.amount > 0 ? { label: formatFinanceDirection(draft.direction), strong: false } : null;
  return [amount, direction].filter(Boolean).slice(0, MAX_PREVIEW_SIGNALS) as CapturePreviewSignal[];
}

function pickFoodSignals(draft: FoodDraft): CapturePreviewSignal[] {
  const macros = [draft.protein, draft.fat, draft.carbs].some((value) => value !== null && value > 0);
  const macroLabel = macros
    ? {
        label: `Б${draft.protein ?? 0} Ж${draft.fat ?? 0} У${draft.carbs ?? 0}`,
        strong: true,
      }
    : draft.calories !== null && draft.calories > 0
      ? { label: `${draft.calories} ккал`, strong: true }
      : null;
  const grams = draft.grams !== null && draft.grams > 0 ? { label: `${draft.grams} г`, strong: false } : null;
  return [macroLabel, grams].filter(Boolean).slice(0, MAX_PREVIEW_SIGNALS) as CapturePreviewSignal[];
}
