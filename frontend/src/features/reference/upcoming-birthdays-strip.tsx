"use client";

import { Gift } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatBirthdayCountdown,
  getPersonDisplayName,
  getUpcomingBirthdays,
  personAge,
  personAvatarTone,
  personInitials,
} from "@/lib/people";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type UpcomingBirthdaysStripProps = {
  people: Entry[];
  withinDays?: number;
  onSelect: (personId: string) => void;
};

function groupLabel(daysUntil: number) {
  if (daysUntil === 0) {
    return "Сегодня";
  }
  if (daysUntil <= 6) {
    return "На неделе";
  }
  return "Позже";
}

export function UpcomingBirthdaysStrip({
  people,
  withinDays = 30,
  onSelect,
}: UpcomingBirthdaysStripProps) {
  const upcoming = getUpcomingBirthdays(people, withinDays);

  if (upcoming.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <Gift className="size-4 shrink-0 text-primary" aria-hidden="true" />
          Ближайших дней рождения нет. Укажите даты рождения в карточках людей.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Gift className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Ближайшие дни рождения</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory">
        {upcoming.map(({ person, daysUntil }) => {
          const name = getPersonDisplayName(person);
          const birthday = person.metadata.birthday;
          const age =
            typeof birthday === "string" ? personAge(birthday) : null;
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => onSelect(person.id)}
              className="focus-ring snap-start min-w-[220px] rounded-md border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="mb-2 flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    personAvatarTone(name),
                  )}
                >
                  {personInitials(name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {typeof birthday === "string" ? formatBirthdayCountdown(birthday) : "ДР не указан"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{groupLabel(daysUntil)}</Badge>
                {age !== null ? <span className="text-xs text-muted-foreground">{age} лет</span> : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
