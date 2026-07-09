"use client";

import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FinanceAIStatus } from "@/lib/finance-import";
import { cn } from "@/lib/utils";

export function FinanceAIStatusCard({
  status,
  isLoading,
}: {
  status: FinanceAIStatus | null;
  isLoading: boolean;
}) {
  const ready = status?.ready ?? false;

  return (
    <Card className="border-border/80 bg-gradient-to-br from-card to-muted/30">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          GitHub Models
        </CardTitle>
        <Badge variant={ready ? "default" : "secondary"}>{ready ? "Готов" : "Не настроен"}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Проверяем подключение...</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Провайдер</span>
              <span className="font-medium">{status?.provider || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Модель</span>
              <span className={cn("font-mono text-xs", !status?.model && "text-muted-foreground")}>
                {status?.model || "openai/gpt-4o-mini"}
              </span>
            </div>
            <p className="text-muted-foreground">{status?.message || "Добавьте токен в backend/.env"}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
