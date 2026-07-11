export type ArticlesEmptyStateKind = "loading" | "filtered-empty" | "true-empty" | "content";

export function getArticlesEmptyState({
  isLoading,
  articlesCount,
  filteredCount,
  hasActiveFilter,
}: {
  isLoading: boolean;
  articlesCount: number;
  filteredCount: number;
  hasActiveFilter: boolean;
}): ArticlesEmptyStateKind {
  if (isLoading) {
    return "loading";
  }
  if (filteredCount > 0) {
    return "content";
  }
  if (hasActiveFilter && articlesCount > 0) {
    return "filtered-empty";
  }
  return "true-empty";
}
