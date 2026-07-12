"use client";

import { Suspense } from "react";

import SearchPageContent from "./search-page-content";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-sm text-muted-foreground">Загрузка поиска…</p>}>
      <SearchPageContent />
    </Suspense>
  );
}
