export function ArticleCardSkeleton() {
  return (
    <div className="articles-skeleton p-4">
      <div className="mb-3 flex gap-3">
        <div className="size-9 shrink-0 rounded-md bg-[var(--articles-border)]/40" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-[var(--articles-border)]/40" />
          <div className="h-4 w-full rounded bg-[var(--articles-border)]/40" />
          <div className="h-4 w-5/6 rounded bg-[var(--articles-border)]/40" />
        </div>
      </div>
      <div className="mb-4 space-y-2">
        <div className="h-3 w-full rounded bg-[var(--articles-border)]/30" />
        <div className="h-3 w-10/12 rounded bg-[var(--articles-border)]/30" />
      </div>
      <div className="flex gap-2">
        <div className="h-11 w-28 rounded-md bg-[var(--articles-border)]/40" />
        <div className="size-11 rounded-md bg-[var(--articles-border)]/30" />
        <div className="size-11 rounded-md bg-[var(--articles-border)]/30" />
      </div>
    </div>
  );
}
