"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SessionTranscriptPanelProps = {
  transcript: string;
};

export function SessionTranscriptPanel({ transcript }: SessionTranscriptPanelProps) {
  const [speakerFilter, setSpeakerFilter] = useState<"all" | "client" | "therapist">("all");

  const lines = useMemo(() => transcript.split("\n").filter(Boolean), [transcript]);

  const filteredLines = useMemo(() => {
    if (speakerFilter === "all") return lines;
    const label = speakerFilter === "client" ? "Клиент" : "Психолог";
    return lines.filter((line) => line.includes(`${label}:`));
  }, [lines, speakerFilter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Транскрипт</CardTitle>
        <div className="flex gap-2">
          <FilterButton active={speakerFilter === "all"} onClick={() => setSpeakerFilter("all")}>
            Все
          </FilterButton>
          <FilterButton active={speakerFilter === "client"} onClick={() => setSpeakerFilter("client")}>
            Клиент
          </FilterButton>
          <FilterButton active={speakerFilter === "therapist"} onClick={() => setSpeakerFilter("therapist")}>
            Психолог
          </FilterButton>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap text-sm leading-relaxed">
          {filteredLines.join("\n") || "Транскрипт пуст."}
        </pre>
      </CardContent>
    </Card>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}
