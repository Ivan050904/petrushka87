"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { VoiceTranscribePanel } from "@/features/transcription/voice-transcribe-panel";
import { useRequireAuth } from "@/hooks/use-auth";
import { resolveApiBaseUrl } from "@/lib/api-base-url";
import { ROUTES } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type TranscriptionTab = "voice" | "legacy";
type IframeStatus = "loading" | "ready" | "error";

const IFRAME_TIMEOUT_MS = 15_000;

function transcriptionBackendOrigin() {
  return resolveApiBaseUrl().replace(/\/api\/v1\/?$/, "");
}

export function TranscriptionView() {
  const { token, isLoading } = useRequireAuth();
  const [tab, setTab] = useState<TranscriptionTab>("voice");
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>("loading");

  const embedUrl = useMemo(() => {
    const origin = transcriptionBackendOrigin();
    if (!token) {
      return `${origin}/transcription/sso`;
    }
    return `${origin}/transcription/sso?access_token=${encodeURIComponent(token)}`;
  }, [token]);

  useEffect(() => {
    if (tab !== "legacy") {
      return;
    }
    setIframeStatus("loading");
    const timeoutId = window.setTimeout(() => {
      setIframeStatus((current) => (current === "loading" ? "error" : current));
    }, IFRAME_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [tab, embedUrl]);

  if (isLoading) {
    return <p className="px-4 py-6 text-sm text-muted-foreground lg:px-6">Загрузка…</p>;
  }

  if (!token) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8 lg:px-6">
        <h1 className="text-xl font-semibold">Транскрибация</h1>
        <p className="text-sm text-muted-foreground">
          Голосовая и файловая транскрибация доступна после входа в аккаунт.
        </p>
        <Button asChild>
          <Link href={ROUTES.login}>Войти</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 lg:px-4">
        <h1 className="text-lg font-semibold tracking-tight">Транскрибация</h1>
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "voice"} onClick={() => setTab("voice")}>
            Голос
          </TabButton>
          <TabButton active={tab === "legacy"} onClick={() => setTab("legacy")}>
            YouTube (legacy)
          </TabButton>
        </div>
      </div>

      {tab === "voice" ? (
        <VoiceTranscribePanel />
      ) : iframeStatus === "error" ? (
        <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
          <Notice variant="info">
            Не удалось загрузить встроенный интерфейс транскрибации. Откройте его в отдельной вкладке.
          </Notice>
          <LoadError
            message="Проверьте, что backend запущен и доступен по адресу API."
            onRetry={() => setIframeStatus("loading")}
          />
          <Button asChild variant="outline" className="w-fit">
            <a href={embedUrl} target="_blank" rel="noopener noreferrer">
              Открыть транскрибацию в новой вкладке
            </a>
          </Button>
        </div>
      ) : (
        <>
          {iframeStatus === "loading" ? (
            <p className="px-4 py-3 text-sm text-muted-foreground lg:px-6">Загрузка интерфейса…</p>
          ) : null}
          <iframe
            title="Транскрибация YouTube"
            src={embedUrl}
            className={cn(
              "block min-h-0 w-full flex-1 border-0 bg-background",
              iframeStatus === "loading" && "opacity-0",
            )}
            allow="clipboard-write"
            onLoad={() => setIframeStatus("ready")}
            onError={() => setIframeStatus("error")}
          />
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("filter-pill", active ? "filter-pill-active" : "filter-pill-inactive")}
    >
      {children}
    </button>
  );
}
