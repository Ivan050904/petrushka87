import type { CapturePreviewItem } from "@/features/capture/capture-preview-items";
import { previewEffectiveType } from "@/features/capture/capture-preview-items";
import { pickCapturePreviewSignals } from "@/features/capture/capture-preview-signals";
import type { QuickEntryType } from "@/features/capture/quick-capture-helpers";
import { formatEntryType } from "@/lib/labels";

export type CaptureOverlayChip = {
  id: string;
  label: string;
  kind: "type" | "signal" | "token" | "ai-hint";
  strong?: boolean;
};

export function buildCaptureOverlayChips(
  quickType: QuickEntryType,
  content: string,
  previewItems: CapturePreviewItem[],
): CaptureOverlayChip[] {
  const detectedType = content.trim() ? previewEffectiveType(quickType, content) : null;
  const typeLabel =
    quickType === "auto"
      ? detectedType
        ? `Авто · ${formatEntryType(detectedType)}`
        : "Авто"
      : formatEntryType(quickType);

  const chips: CaptureOverlayChip[] = [
    {
      id: "type",
      label: typeLabel,
      kind: "type",
      strong: true,
    },
  ];

  const firstItem = previewItems[0];
  if (!firstItem) {
    return chips;
  }

  const signals = pickCapturePreviewSignals(firstItem.entryType, firstItem.draft);
  for (const signal of signals) {
    chips.push({
      id: `signal-${signal.label}`,
      label: signal.label,
      kind: "signal",
      strong: signal.strong,
    });
  }

  const usedLabels = new Set(chips.map((chip) => chip.label.toLowerCase()));
  for (const token of firstItem.draft.recognizedTokens ?? []) {
    const normalized = token.text.trim().toLowerCase();
    if (!normalized || usedLabels.has(normalized)) {
      continue;
    }
    usedLabels.add(normalized);
    chips.push({
      id: `token-${token.start}-${token.end}`,
      label: token.text.trim(),
      kind: "token",
      strong: token.kind === "time" || token.kind === "date",
    });
    if (chips.length >= 5) {
      break;
    }
  }

  if (previewItems.length > 1) {
    chips.push({
      id: "more-items",
      label: `+${previewItems.length - 1}`,
      kind: "signal",
    });
  }

  return chips.slice(0, 6);
}
