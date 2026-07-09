"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown, SendHorizonal, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildCapturePreviewItems } from "@/features/capture/capture-preview-items";
import { CaptureDraftPreview, CaptureEntryResultCard } from "@/features/capture/capture-entry-preview";
import { quickTypeOptions } from "@/features/capture/capture-entry-types";
import {
  aiTaskToCaptureDraft,
  autoEntryPayload,
  buildCapturePayloads,
  parseQuickTasks,
  type QuickEntryType,
} from "@/features/capture/quick-capture-helpers";
import { createEntry, getErrorMessage, parseTasks } from "@/lib/api";
import { formatEntryType } from "@/lib/labels";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type QuickCaptureProps = {
  token: string | null;
  onSaved?: () => void | Promise<void>;
  className?: string;
  variant?: "default" | "compact";
};

export function QuickCapture({ token, onSaved, className, variant = "default" }: QuickCaptureProps) {
  const [quickType, setQuickType] = useState<QuickEntryType>("auto");
  const [quickContent, setQuickContent] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const [aiTaskDrafts, setAiTaskDrafts] = useState<ReturnType<typeof parseQuickTasks> | null>(null);
  const [aiEntryPreview, setAiEntryPreview] = useState<Entry | null>(null);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(variant !== "compact");
  const containerRef = useRef<HTMLElement>(null);
  const feedbackId = useId();
  const typeSelectId = useId();

  const isCompact = variant === "compact";

  const manualTaskDrafts = useMemo(
    () => (quickType === "task" ? parseQuickTasks(quickContent) : []),
    [quickContent, quickType],
  );
  const taskDrafts = aiTaskDrafts ?? manualTaskDrafts;
  const previewItems = useMemo(
    () => buildCapturePreviewItems(quickType, quickContent, taskDrafts),
    [quickType, quickContent, taskDrafts],
  );

  const isOpen =
    !isCompact ||
    isExpanded ||
    Boolean(quickContent.trim()) ||
    Boolean(quickError) ||
    Boolean(quickNotice) ||
    previewItems.length > 0;

  const showPreviewAside = isOpen && previewItems.length > 0 && !aiEntryPreview;
  const showResultAside = isOpen && quickType === "auto" && Boolean(aiEntryPreview);
  const feedbackDescribedBy = [
    isOpen ? `${feedbackId}-hint` : null,
    quickError ? `${feedbackId}-error` : null,
    quickNotice ? `${feedbackId}-notice` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const canClassifyWithAi = quickType === "auto" || quickType === "task";

  function resetNotices() {
    setQuickError(null);
    setQuickNotice(null);
    setAiEntryPreview(null);
    setAiTaskDrafts(null);
  }

  function handleBlur() {
    if (!isCompact || quickContent.trim() || quickError || quickNotice || previewItems.length > 0) {
      return;
    }
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setIsExpanded(false);
      }
    }, 0);
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
      if (result.effectiveType === "task") {
        setQuickNotice(`Создано задач: ${created.length}.`);
      } else {
        setQuickNotice(`Сохранено как ${formatEntryType(result.effectiveType)}.`);
      }

      setQuickContent("");
      setAiTaskDrafts(null);
      if (isCompact) {
        setIsExpanded(false);
      }
      await onSaved?.();
    } catch (requestError) {
      setQuickError(getErrorMessage(requestError, "Не удалось сохранить запись."));
    } finally {
      setIsQuickSaving(false);
    }
  }

  function handleQuickKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && isCompact) {
      event.preventDefault();
      setQuickContent("");
      resetNotices();
      setIsExpanded(false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void saveQuickEntry();
    }
  }

  return (
    <section
      ref={containerRef}
      onBlur={handleBlur}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card shadow-panel transition-shadow",
        isCompact && isOpen && "ring-1 ring-primary/20",
        className,
      )}
    >
      <div
        className={cn(
          showPreviewAside || showResultAside
            ? "md:grid md:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] md:items-stretch"
            : undefined,
        )}
      >
        <div className="min-w-0">
          <div className={cn("px-4", isOpen ? "pt-4" : "py-3")}>
            <Textarea
              aria-label="Быстрая запись"
              aria-describedby={feedbackDescribedBy || undefined}
              aria-invalid={Boolean(quickError)}
              value={quickContent}
              onChange={(event) => {
                setQuickContent(event.target.value);
                resetNotices();
              }}
              onFocus={() => {
                if (isCompact) {
                  setIsExpanded(true);
                }
              }}
              onKeyDown={handleQuickKeyDown}
              rows={isOpen ? 4 : 1}
              className={cn(
                "resize-none border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0",
                isOpen ? "min-h-24 leading-7" : "min-h-11 leading-6",
              )}
              placeholder="Задача, финансы, питание или заметка — 500р кофе · б45ж8у30 · завтра 18:00 созвон"
            />
            {isOpen ? (
              <p id={`${feedbackId}-hint`} className="mt-2 text-xs text-muted-foreground">
                Ctrl+Enter — сохранить · Esc — свернуть
              </p>
            ) : null}
          </div>

          {isOpen ? (
            <>
              <div className="mx-4 border-t border-border" />
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={typeSelectId} className="text-xs font-medium text-muted-foreground">
                    Тип
                  </label>
                  <div className="relative">
                    <Select
                      id={typeSelectId}
                      aria-label="Указать тип"
                      value={quickType}
                      onChange={(event) => {
                        setQuickType(event.target.value as QuickEntryType);
                        resetNotices();
                      }}
                      className="w-[9.5rem] appearance-none border-border/70 bg-muted/30 pr-9 font-medium hover:border-input hover:bg-muted/50"
                    >
                      {quickTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-10"
                    onClick={() => void parseQuickWithAi()}
                    disabled={!canClassifyWithAi || isAiParsing || !quickContent.trim()}
                  >
                    <Sparkles data-icon="inline-start" />
                    {isAiParsing ? "Распознавание" : "ИИ"}
                  </Button>
                  <Button
                    size="sm"
                    className="min-h-10 min-w-28"
                    onClick={() => void saveQuickEntry()}
                    disabled={isQuickSaving || !quickContent.trim()}
                  >
                    <SendHorizonal data-icon="inline-start" />
                    {isQuickSaving ? "Создание" : "Добавить"}
                  </Button>
                </div>
              </div>
            </>
          ) : isCompact ? null : (
            <div className="flex justify-end gap-2 px-4 pb-3">
              <Button variant="outline" size="sm" className="min-h-9" onClick={() => setIsExpanded(true)}>
                <Sparkles data-icon="inline-start" />
                ИИ
              </Button>
              <Button size="sm" className="min-h-9" onClick={() => setIsExpanded(true)}>
                <SendHorizonal data-icon="inline-start" />
                Добавить
              </Button>
            </div>
          )}

          {quickError ? (
            <div className="px-4 pb-3">
              <Notice id={`${feedbackId}-error`} variant="error">
                {quickError}
              </Notice>
            </div>
          ) : null}
          {quickNotice ? (
            <div className="px-4 pb-3">
              <Notice id={`${feedbackId}-notice`} variant="success">
                {quickNotice}
              </Notice>
            </div>
          ) : null}
        </div>

        {showPreviewAside ? (
          <CaptureDraftPreview
            items={previewItems}
            isAiParsed={Boolean(aiTaskDrafts)}
            layout="column"
            surface="aside"
            maxVisible={6}
          />
        ) : null}

        {showResultAside && aiEntryPreview ? (
          <CaptureEntryResultCard entry={aiEntryPreview} surface="aside" />
        ) : null}
      </div>
    </section>
  );
}
