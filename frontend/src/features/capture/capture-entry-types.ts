import type { EntryType } from "@/lib/types";

export type QuickCaptureEntryType = Extract<EntryType, "task" | "finance" | "food" | "note">;

export type QuickEntryType = QuickCaptureEntryType | "auto";

export const QUICK_CAPTURE_ENTRY_TYPES: QuickCaptureEntryType[] = ["task", "finance", "food", "note"];

export const quickTypeOptions: { value: QuickEntryType; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "task", label: "Задача" },
  { value: "finance", label: "Финансы" },
  { value: "food", label: "Питание" },
  { value: "note", label: "Заметка" },
];
