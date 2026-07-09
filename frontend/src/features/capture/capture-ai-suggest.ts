import { detectCaptureType } from "@/features/capture/capture-type-detector";
import { scoreFinanceDraft, parseFinanceLine } from "@/features/capture/finance-draft-parser";
import { scoreFoodDraft, parseFoodLine } from "@/features/capture/food-draft-parser";
import type { QuickEntryType } from "@/features/capture/quick-capture-helpers";
import { parseQuickTasks } from "@/features/capture/task-draft-parser";

const AI_SUGGEST_CHAR_LIMIT = 120;
const AI_SUGGEST_LINE_LIMIT = 2;

export function shouldSuggestAi(content: string, quickType: QuickEntryType): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  if (quickType === "finance" || quickType === "food" || quickType === "note") {
    return trimmed.length >= AI_SUGGEST_CHAR_LIMIT;
  }

  if (trimmed.length >= AI_SUGGEST_CHAR_LIMIT) {
    return true;
  }

  const lines = trimmed.split(/\n+/).filter(Boolean);
  if (lines.length > AI_SUGGEST_LINE_LIMIT) {
    return true;
  }

  if (quickType === "auto") {
    const detected = detectCaptureType(trimmed);
    if (detected === "note" && trimmed.length >= 60) {
      return true;
    }
    if (detected === "task") {
      const drafts = parseQuickTasks(trimmed);
      if (drafts.length === 0 || drafts.every((draft) => draft.recognizedTokens.length === 0)) {
        return true;
      }
    }
    if (detected === "finance" && scoreFinanceDraft(parseFinanceLine(trimmed)) < 5) {
      return true;
    }
    if (detected === "food" && scoreFoodDraft(parseFoodLine(trimmed)) < 4) {
      return true;
    }
  }

  if (lines.length > 1 && parseQuickTasks(trimmed).length > 1) {
    return true;
  }

  return false;
}
