"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { SegmentTabs } from "@/components/ui/segment-tabs";
import { PeoplePanel } from "@/features/reference/people-panel";
import { ResourcesPanel } from "@/features/reference/resources-panel";
import type { ReferenceTab } from "@/lib/navigation";

export function ReferenceView() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as ReferenceTab | null) ?? "people";
  const [tab, setTab] = useState<ReferenceTab>(initialTab === "resources" ? "resources" : "people");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-8">Справочник</h1>
        <p className="text-sm text-muted-foreground">Люди и файловые ресурсы.</p>
      </header>

      <SegmentTabs
        value={tab}
        onChange={setTab}
        className="grid-cols-2 sm:max-w-sm"
        options={[
          { value: "people", label: "Люди" },
          { value: "resources", label: "Ресурсы" },
        ]}
      />

      {tab === "people" ? <PeoplePanel embedded /> : null}
      {tab === "resources" ? <ResourcesPanel embedded /> : null}
    </div>
  );
}
