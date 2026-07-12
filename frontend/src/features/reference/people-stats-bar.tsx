"use client";

import type { Entry } from "@/lib/types";
import { countBirthdaysThisWeek, countPeopleWithBirthday } from "@/lib/people";

type PeopleStatsBarProps = {
  people: Entry[];
};

export function PeopleStatsBar({ people }: PeopleStatsBarProps) {
  const withBirthday = countPeopleWithBirthday(people);
  const thisWeek = countBirthdaysThisWeek(people);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border bg-card px-4 py-3 text-sm">
      <span>
        <span className="text-muted-foreground">Всего </span>
        <span className="font-semibold">{people.length}</span>
      </span>
      <span>
        <span className="text-muted-foreground">С ДР </span>
        <span className="font-semibold">{withBirthday}</span>
      </span>
      <span>
        <span className="text-muted-foreground">На этой неделе </span>
        <span className="font-semibold">{thisWeek}</span>
      </span>
    </div>
  );
}
