"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CapturePreviewItem } from "@/features/capture/capture-preview-items";
import { pickCapturePreviewSignals } from "@/features/capture/capture-preview-signals";
import type { CaptureTaskDraft, RecognizedToken } from "@/features/capture/task-draft-parser";
import { entryModuleHref } from "@/lib/entry-helpers";
import { formatEntryType } from "@/lib/labels";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type CaptureDraftPreviewProps = {
  items: CapturePreviewItem[];
  isAiParsed?: boolean;
  layout?: "stack" | "scroll" | "column";
  maxVisible?: number;
  className?: string;
  surface?: "default" | "embedded" | "aside";
};

export function CaptureDraftPreview({
  items,
  isAiParsed = false,
  layout = "stack",
  maxVisible = 8,
  className,
  surface = "default",
}: CaptureDraftPreviewProps) {
  if (items.length === 0) {
    return null;
  }

  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = items.length - visibleItems.length;
  const nested = surface === "aside" || surface === "embedded";

  return (
    <div
      className={cn(
        surface === "embedded"
          ? "mt-3 rounded-md border border-border bg-muted/25 p-3"
          : surface === "aside"
            ? "border-t border-border px-4 py-4 md:border-l md:border-t-0 md:px-4 md:py-4"
            : "border-t border-border px-4 py-4",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3 md:mb-3">
        <h2 className="text-sm font-semibold">{surface === "aside" ? "Создастся" : "Будут созданы"}</h2>
        <div className="flex items-center gap-2">
          {isAiParsed ? <Badge variant="default">ИИ</Badge> : null}
          <Badge variant="secondary">{items.length}</Badge>
        </div>
      </div>

      <div
        className={cn(
          layout === "scroll"
            ? "flex gap-2 overflow-x-auto pb-1"
            : layout === "column"
              ? "flex max-h-64 flex-col gap-2 overflow-y-auto pr-1"
              : "grid gap-3 lg:grid-cols-2",
        )}
      >
        {visibleItems.map((item, index) => (
          <CaptureDraftCard
            key={`${item.entryType}-${item.draft.sourceText}-${index}`}
            item={item}
            compact={layout === "scroll"}
            nested={nested}
          />
        ))}
      </div>

      {hiddenCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">И ещё {hiddenCount} записей будут созданы при сохранении.</p>
      ) : null}
    </div>
  );
}

function CaptureDraftCard({
  item,
  compact,
  nested,
}: {
  item: CapturePreviewItem;
  compact?: boolean;
  nested?: boolean;
}) {
  const { draft, entryType } = item;
  const signals = pickCapturePreviewSignals(entryType, draft);

  return (
    <article
      className={cn(
        "rounded-md border p-3",
        nested ? "border-border/80 bg-muted/20" : "border-border bg-background",
        compact && "min-w-[280px] max-w-sm shrink-0",
      )}
    >
      <div className="mb-2">
        <Badge variant="secondary">{formatEntryType(entryType)}</Badge>
      </div>

      <HighlightedCaptureText draft={draft} />

      {signals.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {signals.map((signal) => (
            <Badge key={signal.label} variant={signal.strong ? "default" : "outline"}>
              {signal.label}
            </Badge>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function HighlightedCaptureText({
  draft,
}: {
  draft: { title: string; sourceText?: string; description?: string; recognizedTokens?: CaptureTaskDraft["recognizedTokens"] };
}) {
  const source = draft.sourceText || draft.description || draft.title;
  const tokens = (draft.recognizedTokens ?? [])
    .filter((token) => token.start >= 0 && token.end <= source.length && token.start < token.end)
    .sort((left, right) => left.start - right.start);

  if (tokens.length === 0) {
    return <p className="line-clamp-3 text-sm font-medium leading-6 text-foreground">{draft.title}</p>;
  }

  let cursor = 0;
  const parts: ReactNode[] = [];
  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      parts.push(source.slice(cursor, token.start));
    }
    parts.push(
      <span key={`${token.start}-${token.end}-${index}`} title={token.label} className={captureTokenClass(token.kind)}>
        {source.slice(token.start, token.end)}
      </span>,
    );
    cursor = token.end;
  });

  if (cursor < source.length) {
    parts.push(source.slice(cursor));
  }

  return <p className="line-clamp-3 text-sm leading-6 text-foreground">{parts}</p>;
}

function captureTokenClass(kind: RecognizedToken["kind"]) {
  return cn("capture-token rounded px-1 py-0.5 font-medium", {
    "capture-token-date": kind === "date" || kind === "time",
    "capture-token-priority": kind === "priority",
    "capture-token-tag": kind === "tag",
    "capture-token-assignee": kind === "assignee",
    "capture-token-meta": kind === "duration" || kind === "reminder" || kind === "recurrence",
    "capture-token-status": kind === "status",
  });
}

export function CaptureEntryResultCard({ entry, surface = "default" }: { entry: Entry; surface?: "default" | "aside" }) {
  const nested = surface === "aside";

  return (
    <div
      className={cn(
        surface === "aside"
          ? "border-t border-border px-4 py-4 md:border-l md:border-t-0 md:px-4 md:py-4"
          : "border-t border-border px-4 py-4",
      )}
    >
      <article className={cn("rounded-md border p-3", nested ? "border-border/80 bg-muted/20" : "border-border bg-background")}>
        <div className="mb-2">
          <Badge variant="secondary">{formatEntryType(entry.type)}</Badge>
        </div>
        <h3 className="truncate text-sm font-medium">{entry.title || entry.content}</h3>
        <Button asChild variant="outline" size="sm" className="mt-3 min-h-10">
          <Link href={entryModuleHref(entry)}>Открыть</Link>
        </Button>
      </article>
    </div>
  );
}
