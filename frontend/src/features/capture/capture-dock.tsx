"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown, SendHorizonal, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { shouldSuggestAi } from "@/features/capture/capture-ai-suggest";
import { quickTypeOptions } from "@/features/capture/capture-entry-types";
import { buildCaptureOverlayChips } from "@/features/capture/capture-overlay-chips";
import { buildCapturePreviewItems } from "@/features/capture/capture-preview-items";
import {
  aiTaskToCaptureDraft,
  autoEntryPayload,
  buildCapturePayloads,
  parseQuickTasks,
  type QuickEntryType,
} from "@/features/capture/quick-capture-helpers";
import { createEntry, getErrorMessage, parseTasks } from "@/lib/api";
import { entryModuleHref } from "@/lib/entry-helpers";
import { formatEntryType } from "@/lib/labels";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type CaptureDockProps = {
  token: string | null;
  onSaved?: () => void | Promise<void>;
  className?: string;
};

export function CaptureDock({ token, onSaved, className }: CaptureDockProps) {
  const [quickType, setQuickType] = useState<QuickEntryType>("auto");
  const [quickContent, setQuickContent] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const [aiTaskDrafts, setAiTaskDrafts] = useState<ReturnType<typeof parseQuickTasks> | null>(null);
  const [aiEntryPreview, setAiEntryPreview] = useState<Entry | null>(null);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const feedbackId = useId();
  const typeListboxId = useId();

  const manualTaskDrafts = useMemo(
    () => (quickType === "task" ? parseQuickTasks(quickContent) : []),
    [quickContent, quickType],
  );
  const taskDrafts = aiTaskDrafts ?? manualTaskDrafts;
  const previewItems = useMemo(
    () => buildCapturePreviewItems(quickType, quickContent, taskDrafts),
    [quickType, quickContent, taskDrafts],
  );
  const overlayChips = useMemo(
    () => buildCaptureOverlayChips(quickType, quickContent, previewItems),
    [quickType, quickContent, previewItems],
  );
  const suggestAi = useMemo(() => shouldSuggestAi(quickContent, quickType), [quickContent, quickType]);

  const hasOverlay = overlayChips.length > 1 || suggestAi || Boolean(aiEntryPreview);
  const feedbackDescribedBy = [
    `${feedbackId}-hint`,
    quickError ? `${feedbackId}-error` : null,
    quickNotice ? `${feedbackId}-notice` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const canClassifyWithAi = quickType === "auto" || quickType === "task";

  useEffect(() => {
    if (!isTypePickerOpen) {
      return;
    }
    function closeOnPointer(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsTypePickerOpen(false);
      }
    }
    window.addEventListener("mousedown", closeOnPointer);
    return () => window.removeEventListener("mousedown", closeOnPointer);
  }, [isTypePickerOpen]);

  function resetNotices() {
    setQuickError(null);
    setQuickNotice(null);
    setAiEntryPreview(null);
    setAiTaskDrafts(null);
  }

  async function parseQuickWithAi() {
    if (!token || isAiParsing || !canClassifyWithAi) {
      return;
    }
    if (!quickContent.trim()) {
      setQuickError("Напиши текст для распознавания.");
      return;
    }

    setIsAiParsing(true);
    resetNotices();
    try {
      if (quickType === "auto") {
        const created = await createEntry(token, autoEntryPayload(quickContent.trim()));
        setAiEntryPreview(created);
        setQuickContent("");
        setQuickNotice(`ИИ сохранил как ${formatEntryType(created.type)}.`);
        await onSaved?.();
        return;
      }

      const result = await parseTasks(token, quickContent.trim());
      const drafts = result.tasks.map(aiTaskToCaptureDraft).filter((draft) => draft.title.trim());
      if (drafts.length === 0) {
        setQuickError("ИИ не нашел задач в этом тексте.");
        return;
      }
      setAiTaskDrafts(drafts);
      setQuickNotice(`ИИ распознал задач: ${drafts.length}.`);
    } catch (requestError) {
      setQuickError(getErrorMessage(requestError, "Не удалось распознать через ИИ."));
    } finally {
      setIsAiParsing(false);
    }
  }

  async function saveQuickEntry() {
    if (!token || isQuickSaving) {
      return;
    }

    const content = quickContent.trim();
    if (!content) {
      setQuickError("Добавь текст записи.");
      return;
    }

    setIsQuickSaving(true);
    setQuickError(null);
    setQuickNotice(null);
    try {
      const result = buildCapturePayloads(quickType, content, taskDrafts);
      if (!result.ok) {
        setQuickError(result.error);
        return;
      }

      const created = await Promise.all(result.payloads.map((payload) => createEntry(token, payload)));
      const typeLabel = formatEntryType(result.effectiveType);

      if (result.effectiveType === "task") {
        setQuickNotice(`Создано задач: ${created.length}.`);
      } else {
        setQuickNotice(`Сохранено как ${typeLabel}.`);
      }

      setQuickContent("");
      setAiTaskDrafts(null);
      await onSaved?.();
    } catch (requestError) {
      setQuickError(getErrorMessage(requestError, "Не удалось сохранить запись."));
    } finally {
      setIsQuickSaving(false);
    }
  }

  function handleQuickKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuickContent("");
      resetNotices();
      setIsTypePickerOpen(false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void saveQuickEntry();
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative shrink-0 border-t border-border bg-card/95 backdrop-blur-md", className)}
      aria-label="Быстрая запись"
    >
      {hasOverlay ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-full z-10 pb-2"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="pointer-events-auto mx-auto flex max-w-4xl flex-col gap-2 lg:max-w-none">
            {aiEntryPreview ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{formatEntryType(aiEntryPreview.type)}</Badge>
                <span className="truncate text-sm font-medium">{aiEntryPreview.title || aiEntryPreview.content}</span>
                <Button asChild variant="outline" size="sm" className="ml-auto h-8">
                  <Link href={entryModuleHref(aiEntryPreview)}>Открыть</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {overlayChips.map((chip) =>
                  chip.kind === "type" ? (
                    <div key={chip.id} className="relative">
                      <button
                        type="button"
                        onClick={() => setIsTypePickerOpen((current) => !current)}
                        className="focus-ring inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15"
                        aria-expanded={isTypePickerOpen}
                        aria-haspopup="listbox"
                        aria-controls={typeListboxId}
                      >
                        {chip.label}
                        <ChevronDown aria-hidden="true" className="size-3" />
                      </button>
                      {isTypePickerOpen ? (
                        <ul
                          id={typeListboxId}
                          role="listbox"
                          aria-label="Тип записи"
                          className="absolute bottom-full left-0 z-30 mb-1.5 min-w-[9.5rem] rounded-md border border-border/80 bg-card p-1 shadow-panel"
                        >
                          {quickTypeOptions.map((option) => (
                            <li key={option.value} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={quickType === option.value}
                                onClick={() => {
                                  setQuickType(option.value);
                                  resetNotices();
                                  setIsTypePickerOpen(false);
                                }}
                                className={cn(
                                  "focus-ring w-full rounded-md px-2.5 py-2 text-left text-sm transition",
                                  quickType === option.value
                                    ? "bg-primary/10 font-medium text-primary"
                                    : "text-foreground hover:bg-muted/60",
                                )}
                              >
                                {option.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <Badge
                      key={chip.id}
                      variant={chip.strong ? "default" : "outline"}
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                    >
                      {chip.label}
                    </Badge>
                  ),
                )}
              </div>
            )}
            {suggestAi && !aiEntryPreview ? (
              <p className="mt-2 text-xs font-medium text-warning">
                Сложный текст — попробуйте ИИ
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="px-0 py-3 lg:py-3.5">
        {quickError ? (
          <div className="mb-2">
            <Notice id={`${feedbackId}-error`} variant="error">
              {quickError}
            </Notice>
          </div>
        ) : null}
        {quickNotice ? (
          <div className="mb-2">
            <Notice id={`${feedbackId}-notice`} variant="success">
              {quickNotice}
            </Notice>
          </div>
        ) : null}

        <div className="mx-auto flex w-full min-w-0 max-w-4xl items-end gap-2.5 lg:max-w-none">
          <Textarea
            aria-label="Быстрая запись"
            aria-describedby={feedbackDescribedBy}
            aria-invalid={Boolean(quickError)}
            value={quickContent}
            onChange={(event) => {
              setQuickContent(event.target.value);
              resetNotices();
            }}
            onKeyDown={handleQuickKeyDown}
            rows={1}
            className="min-h-12 flex-1 resize-none rounded-xl border-border/80 bg-muted/30 px-4 py-3 text-base leading-6 shadow-none focus-visible:ring-primary/30"
            placeholder="Задача, финансы, питание или заметка — 500р кофе · б45ж8у30 · завтра 18:00 созвон"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12 shrink-0 rounded-full"
            aria-label="Распознать через ИИ"
            title="ИИ"
            onClick={() => void parseQuickWithAi()}
            disabled={!canClassifyWithAi || isAiParsing || !quickContent.trim()}
          >
            <Sparkles aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="size-12 shrink-0 rounded-full"
            aria-label="Сохранить запись"
            title="Добавить"
            onClick={() => void saveQuickEntry()}
            disabled={isQuickSaving || !quickContent.trim()}
          >
            <SendHorizonal aria-hidden="true" className="size-4" />
          </Button>
        </div>
        <p id={`${feedbackId}-hint`} className="mx-auto mt-1 max-w-3xl text-center text-[11px] text-muted-foreground lg:sr-only">
          Ctrl+Enter — сохранить · Esc — очистить
        </p>
      </div>
    </div>
  );
}
