"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";

import { NoteAiPanel } from "@/features/notes/note-ai-panel";
import {
  analyzeLifeNote,
  createEntry,
  deleteEntry,
  getErrorMessage,
  updateEntry,
} from "@/lib/api";
import type { LifeNoteAnalyzeResponse } from "@/lib/api";
import {
  buildLifeNoteMetadata,
  buildLifeNoteTitle,
  formatLifeNoteCardTitle,
  getEditableLifeNoteTitle,
  getLifeNoteCategory,
  getLifeNoteEntryDate,
  getStoredEmotionReview,
  type LifeNoteEmotionReview,
} from "@/lib/life-notes";
import type { Entry } from "@/lib/types";

type NoteEditorProps = {
  token: string;
  entry: Entry | null;
  isNew: boolean;
  defaultCategory: string | null;
  onBack: () => void;
  onSaved: (entry: Entry) => void;
  onDeleted: (entryId: string) => void;
};

export function NoteEditor({
  token,
  entry,
  isNew,
  defaultCategory,
  onBack,
  onSaved,
  onDeleted,
}: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(() => getEditableLifeNoteTitle(entry));
  const [content, setContent] = useState(entry?.content ?? "");
  const [entryDate, setEntryDate] = useState(
    entry ? getLifeNoteEntryDate(entry) : new Date().toISOString().slice(0, 10),
  );
  const [category, setCategory] = useState(
    entry ? getLifeNoteCategory(entry) : defaultCategory ?? undefined,
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [review, setReview] = useState<LifeNoteEmotionReview | LifeNoteAnalyzeResponse | null>(
    entry ? getStoredEmotionReview(entry) : null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(entry?.id ?? null);

  useEffect(() => {
    setTitle(getEditableLifeNoteTitle(entry));
    setContent(entry?.content ?? "");
    setEntryDate(entry ? getLifeNoteEntryDate(entry) : new Date().toISOString().slice(0, 10));
    setCategory(entry ? getLifeNoteCategory(entry) : defaultCategory ?? undefined);
    setReview(entry ? getStoredEmotionReview(entry) : null);
    setEntryId(entry?.id ?? null);
    setSaveState("idle");
    setSaveError(null);
    setAnalyzeError(null);
  }, [entry, defaultCategory, isNew]);

  useEffect(() => {
    if (isNew) {
      titleInputRef.current?.focus();
    }
  }, [isNew]);

  useEffect(() => {
    if (!content.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistEntry(content);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [content, title, entryDate, category]);

  useEffect(() => {
    if (!entryId || !content.trim()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistTitleAndMeta();
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [title, entryDate, category, entryId]);

  function buildMetadata() {
    return {
      ...buildLifeNoteMetadata({
        entryDate,
        category: category ?? undefined,
      }),
      ...(review
        ? {
            ai_emotion_review: {
              ...review,
              reviewed_at: (review as LifeNoteEmotionReview).reviewed_at,
            },
          }
        : {}),
    };
  }

  function resolveTitle() {
    return title.trim() || buildLifeNoteTitle(entryDate);
  }

  async function persistEntry(nextContent: string) {
    if (!nextContent.trim()) {
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    try {
      const saved = entryId
        ? await updateEntry(token, entryId, {
            title: resolveTitle(),
            content: nextContent,
            metadata: buildMetadata(),
          })
        : await createEntry(token, {
            type: "diary",
            title: resolveTitle(),
            content: nextContent,
            metadata: buildLifeNoteMetadata({
              entryDate,
              category: category ?? undefined,
            }),
          });

      setEntryId(saved.id);
      setSaveState("saved");
      onSaved(saved);
    } catch (error) {
      setSaveState("error");
      setSaveError(getErrorMessage(error, "Не удалось сохранить заметку."));
    }
  }

  async function persistTitleAndMeta() {
    if (!entryId) {
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    try {
      const saved = await updateEntry(token, entryId, {
        title: resolveTitle(),
        metadata: buildMetadata(),
      });
      setSaveState("saved");
      onSaved(saved);
    } catch (error) {
      setSaveState("error");
      setSaveError(getErrorMessage(error, "Не удалось сохранить заметку."));
    }
  }

  async function handleAnalyze() {
    if (!content.trim()) {
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const result = await analyzeLifeNote(token, {
        content,
        entry_date: entryDate,
      });
      const reviewedAt = new Date().toISOString();
      const nextReview: LifeNoteEmotionReview = {
        tone: result.tone,
        dry_spots: result.dry_spots,
        summary: result.summary,
        reviewed_at: reviewedAt,
        usage: result.usage ?? undefined,
      };
      setReview(nextReview);

      if (entryId) {
        const saved = await updateEntry(token, entryId, {
          metadata: {
            ...buildLifeNoteMetadata({ entryDate, category: category ?? undefined }),
            ai_emotion_review: nextReview,
          },
        });
        onSaved(saved);
      }
    } catch (error) {
      setAnalyzeError(getErrorMessage(error, "Не удалось выполнить анализ."));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleDelete() {
    if (!entryId) {
      onBack();
      return;
    }
    if (!window.confirm("Удалить эту заметку?")) {
      return;
    }
    try {
      await deleteEntry(token, entryId);
      onDeleted(entryId);
      onBack();
    } catch (error) {
      setSaveError(getErrorMessage(error, "Не удалось удалить заметку."));
    }
  }

  function handleQuoteClick(quote: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const index = content.indexOf(quote);
    if (index === -1) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(index, index + quote.length);
    textarea.scrollIntoView({ block: "center" });
  }

  const titlePlaceholder = formatLifeNoteCardTitle(entryDate);

  return (
    <div className="notes-editor flex min-h-0 flex-1 flex-col lg:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--notes-border)] px-4 py-3 lg:px-6">
          <button
            type="button"
            onClick={onBack}
            className="focus-ring inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm text-[var(--notes-muted)]"
          >
            <ArrowLeft className="size-4" />
            Назад
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--notes-muted)]">
              {saveState === "saving"
                ? "Сохранение..."
                : saveState === "saved"
                  ? "Сохранено"
                  : saveState === "error"
                    ? "Ошибка"
                    : ""}
            </span>
            {entryId ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="focus-ring rounded-full p-2 text-[var(--notes-muted)] hover:text-red-400"
                aria-label="Удалить заметку"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-b border-[var(--notes-border)] px-4 py-4 lg:px-6">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[var(--notes-muted)]">
            Название
          </label>
          <input
            ref={titleInputRef}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setSaveState("idle");
            }}
            placeholder={titlePlaceholder}
            aria-label="Название заметки"
            className="focus-ring w-full rounded-xl border border-[var(--notes-border)] bg-[var(--notes-card)] px-3 py-2.5 text-xl font-semibold text-[var(--notes-text)] outline-none placeholder:text-[var(--notes-muted)]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--notes-muted)]">
            <label className="inline-flex items-center gap-2">
              Дата
              <input
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                className="rounded-lg border border-[var(--notes-border)] bg-[var(--notes-card)] px-2 py-1 text-[var(--notes-text)]"
              />
            </label>
            <label className="inline-flex items-center gap-2">
              Категория
              <input
                value={category ?? ""}
                onChange={(event) => setCategory(event.target.value)}
                className="min-w-[180px] rounded-lg border border-[var(--notes-border)] bg-[var(--notes-card)] px-2 py-1 text-[var(--notes-text)]"
              />
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 px-4 py-4 lg:px-6">
          <textarea
            ref={textareaRef}
            value={content}
            aria-label="Текст заметки"
            onChange={(event) => {
              setContent(event.target.value);
              setSaveState("idle");
            }}
            placeholder="Напиши про свой день. Не только что сделал, но и что чувствовал..."
            className="h-full min-h-[50vh] w-full text-base leading-7 outline-none lg:min-h-0"
          />
        </div>

        {saveError ? <p className="px-4 pb-4 text-sm text-red-400 lg:px-6">{saveError}</p> : null}
      </section>

      <NoteAiPanel
        review={review}
        isLoading={isAnalyzing}
        error={analyzeError}
        onAnalyze={() => void handleAnalyze()}
        onQuoteClick={handleQuoteClick}
        className="border-t border-[var(--notes-border)] lg:max-w-[360px] lg:border-l lg:border-t-0"
      />
    </div>
  );
}
