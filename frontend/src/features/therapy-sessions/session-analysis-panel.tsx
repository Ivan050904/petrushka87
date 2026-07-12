"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TherapySessionAnalysis } from "@/lib/api";

type SessionAnalysisPanelProps = {
  analysis: TherapySessionAnalysis | null;
  markdown: string;
};

export function SessionAnalysisPanel({ analysis, markdown }: SessionAnalysisPanelProps) {
  if (!analysis) {
    return (
      <Card>
        <CardContent className="py-6">
          <pre className="whitespace-pre-wrap text-sm">{markdown || "Анализ пока недоступен."}</pre>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2 xl:gap-4">
      <Section title="Краткий пересказ" className="xl:col-span-2">
        {analysis.session_summary}
      </Section>

      {analysis.key_topics.length > 0 ? (
        <Section title="Ключевые темы">
          <ul className="list-disc space-y-1 pl-5">
            {analysis.key_topics.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {analysis.problems.length > 0 ? (
        <Section title="Проблемы и запросы">
          <div className="space-y-3">
            {analysis.problems.map((item, index) => (
              <div key={`${item.thesis}-${index}`} className="rounded-lg border p-3">
                <div className="font-medium">{item.thesis}</div>
                <blockquote className="mt-2 border-l-2 pl-3 text-sm text-muted-foreground">
                  {item.evidence}
                </blockquote>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {analysis.defense_mechanisms.length > 0 ? (
        <Section title="Защитные механизмы">
          <div className="space-y-3">
            {analysis.defense_mechanisms.map((item, index) => (
              <div key={`${item.name}-${index}`} className="rounded-lg border p-3">
                <div className="font-medium">{item.name}</div>
                <p className="mt-1 text-sm">{item.description}</p>
                <blockquote className="mt-2 border-l-2 pl-3 text-sm text-muted-foreground">
                  {item.evidence}
                </blockquote>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {analysis.emotional_dynamics ? (
        <Section title="Эмоциональная динамика">{analysis.emotional_dynamics}</Section>
      ) : null}

      {analysis.client_patterns.length > 0 ? (
        <Section title="Паттерны клиента">
          <BulletList items={analysis.client_patterns} />
        </Section>
      ) : null}

      {analysis.therapist_interventions.length > 0 ? (
        <Section title="Интервенции терапевта">
          <BulletList items={analysis.therapist_interventions} />
        </Section>
      ) : null}

      {analysis.insights.length > 0 ? (
        <Section title="Инсайты">
          <BulletList items={analysis.insights} />
        </Section>
      ) : null}

      {analysis.homework_or_next_steps.length > 0 ? (
        <Section title="Домашнее задание и следующие шаги">
          <BulletList items={analysis.homework_or_next_steps} />
        </Section>
      ) : null}

      {analysis.open_questions.length > 0 ? (
        <Section title="Открытые вопросы">
          <BulletList items={analysis.open_questions} />
        </Section>
      ) : null}

      {analysis.confidence_notes ? (
        <Section title="Ограничения анализа">{analysis.confidence_notes}</Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-relaxed">{children}</CardContent>
    </Card>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
