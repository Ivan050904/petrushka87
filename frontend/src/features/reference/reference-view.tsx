"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { SegmentTabs } from "@/components/ui/segment-tabs";
import { PeoplePanel } from "@/features/reference/people-panel";
import { ResourcesPanel } from "@/features/reference/resources-panel";
import { referenceHref, type ReferenceTab } from "@/lib/navigation";

export function ReferenceView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: ReferenceTab = tabParam === "resources" ? "resources" : "people";
  const [tab, setTab] = useState<ReferenceTab>(initialTab);

  useEffect(() => {
    const nextTab: ReferenceTab = tabParam === "resources" ? "resources" : "people";
    setTab(nextTab);
  }, [tabParam]);

  const handleTabChange = useCallback(
    (nextTab: ReferenceTab) => {
      setTab(nextTab);
      router.replace(referenceHref({ tab: nextTab }), { scroll: false });
    },
    [router],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold leading-8">Справочник</h1>
        <p className="text-sm text-muted-foreground">Люди и файловые ресурсы.</p>
      </header>

      <SegmentTabs
        value={tab}
        onChange={handleTabChange}
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
