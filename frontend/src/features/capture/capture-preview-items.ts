import type { QuickCaptureEntryType, QuickEntryType } from "@/features/capture/capture-entry-types";
import { stripCaptureMarkers } from "@/features/capture/capture-parse-utils";
import { resolveCaptureType } from "@/features/capture/capture-type-detector";
import { parseFinanceLine } from "@/features/capture/finance-draft-parser";
import { parseFoodLine } from "@/features/capture/food-draft-parser";
import { parseQuickTasks, type CaptureTaskDraft } from "@/features/capture/task-draft-parser";

export type CapturePreviewDraft = CaptureTaskDraft | ReturnType<typeof parseFinanceLine> | ReturnType<typeof parseFoodLine> | {
  title: string;
  sourceText: string;
  description: string;
  recognizedTokens: CaptureTaskDraft["recognizedTokens"];
};

export type CapturePreviewItem = {
  entryType: QuickCaptureEntryType;
  draft: CapturePreviewDraft;
};

export function buildCapturePreviewItems(
  quickType: QuickEntryType,
  content: string,
  taskDrafts: CaptureTaskDraft[] = [],
): CapturePreviewItem[] {
  const raw = content.trim();
  if (!raw) {
    return [];
  }

  const effectiveType = resolveCaptureType(quickType, raw);
  const trimmed = stripCaptureMarkers(raw);

  if (effectiveType === "task") {
    const drafts = taskDrafts.length > 0 ? taskDrafts : parseQuickTasks(trimmed);
    return drafts.filter((draft) => draft.title.trim()).map((draft) => ({ entryType: "task", draft }));
  }

  if (effectiveType === "finance") {
    return [{ entryType: "finance", draft: parseFinanceLine(trimmed) }];
  }

  if (effectiveType === "food") {
    return [{ entryType: "food", draft: parseFoodLine(trimmed) }];
  }

  const sourceText = trimmed.split(/\n+/)[0]?.trim() ?? trimmed;
  return [
    {
      entryType: "note",
      draft: {
        title: sourceText,
        sourceText,
        description: sourceText,
        recognizedTokens: [],
      },
    },
  ];
}

export function previewEffectiveType(quickType: QuickEntryType, content: string): QuickCaptureEntryType {
  return resolveCaptureType(quickType, content.trim());
}
