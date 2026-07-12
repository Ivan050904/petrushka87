"use client";

import Link from "next/link";
import { ArrowRight, Gift } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { referenceHref } from "@/lib/navigation";
import {
  formatBirthdayCountdown,
  getPersonDisplayName,
  getUpcomingBirthdays,
  personAge,
} from "@/lib/people";
import type { Entry } from "@/lib/types";

type BirthdaysWidgetProps = {
  people: Entry[];
  withinDays?: number;
};

export function BirthdaysWidget({ people, withinDays = 14 }: BirthdaysWidgetProps) {
  const upcoming = getUpcomingBirthdays(people, withinDays).slice(0, 5);

  return (
    <section className="rounded-md border border-border bg-card p-4 shadow-panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Дни рождения</h2>
        </div>
        <Link href={referenceHref({ tab: "people" })} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Все
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ближайших дней рождения нет.</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map(({ person, daysUntil }) => {
            const birthday = person.metadata.birthday;
            const age = typeof birthday === "string" ? personAge(birthday) : null;
            return (
              <Link
                key={person.id}
                href={referenceHref({ tab: "people", selected: person.id })}
                className="focus-ring flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 transition hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{getPersonDisplayName(person)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {typeof birthday === "string" ? formatBirthdayCountdown(birthday) : "ДР не указан"}
                    {age !== null ? ` · ${age} лет` : ""}
                  </div>
                </div>
                <Badge variant={daysUntil === 0 ? "default" : "secondary"}>
                  {daysUntil === 0 ? "Сегодня" : daysUntil === 1 ? "Завтра" : `${daysUntil} дн`}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
