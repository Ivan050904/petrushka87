"use client";

import { useMemo } from "react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { BRAND_NAME } from "@/lib/brand";
import { ROUTES } from "@/lib/navigation";

function transcriptionBackendOrigin() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  return apiUrl.replace(/\/api\/v1\/?$/, "");
}

export default function TranscriptionPage() {
  const { token, isLoading } = useAuth();

  const embedUrl = useMemo(() => {
    const origin = transcriptionBackendOrigin();
    if (!token) {
      return `${origin}/transcription/sso`;
    }
    return `${origin}/transcription/sso?access_token=${encodeURIComponent(token)}`;
  }, [token]);

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Загрузка транскрибации…</p>
      </AppShell>
    );
  }

  if (!token) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
          <h1 className="text-xl font-semibold">Транскрибация</h1>
          <p className="text-sm text-muted-foreground">
            Войдите в {BRAND_NAME} — отдельный аккаунт для транскрибации больше не нужен.
          </p>
          <Button asChild>
            <Link href={ROUTES.login}>Войти в {BRAND_NAME}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell contentClassName="p-0">
      <iframe
        title="Транскрибация YouTube"
        src={embedUrl}
        className="h-full min-h-0 w-full flex-1 border-0 bg-background"
        allow="clipboard-write"
      />
    </AppShell>
  );
}
