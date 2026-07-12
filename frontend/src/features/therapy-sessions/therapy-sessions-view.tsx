"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Upload, FileText } from "lucide-react";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { LoadError } from "@/components/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useRequireAuth } from "@/hooks/use-auth";
import {
  deleteTherapySession,
  getErrorMessage,
  getTherapySession,
  getTherapySessionStatus,
  listTherapySessions,
  retryTherapySession,
  uploadTherapySession,
  uploadTherapySessionText,
  type TherapySessionAnalysis,
  type TherapySessionJob,
  type TherapySessionSummary,
} from "@/lib/api";
import { formatDate } from "@/lib/entry-helpers";
import { cn } from "@/lib/utils";

import { SessionAnalysisPanel } from "./session-analysis-panel";
import { SessionProgress } from "./session-progress";
import { SessionTranscriptPanel } from "./session-transcript-panel";

const acceptedFileTypes = ".mp3,.m4a,.wav,.ogg,.webm,.aac,.flac,.mp4";
const MIN_TEXT_LENGTH = 20;

type UploadMode = "audio" | "text";

function formatSessionSource(job: TherapySessionJob) {
  if (job.transcription_source === "text" || job.source_filename === "session.txt") {
    return "Текст";
  }
  return job.source_filename;
}

export function TherapySessionsView() {
  const { token } = useRequireAuth();
  const [sessions, setSessions] = useState<TherapySessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<TherapySessionJob | null>(null);
  const [title, setTitle] = useState("");
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>("audio");
  const [sessionText, setSessionText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [detailTab, setDetailTab] = useState<"analysis" | "transcript">("analysis");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    setListError(null);
    listTherapySessions(token)
      .then(setSessions)
      .catch((err) => setListError(getErrorMessage(err, "Не удалось загрузить сессии.")))
      .finally(() => setIsLoading(false));
  }, [token]);

  const reloadSessions = useCallback(() => {
    if (!token) return;
    setIsLoading(true);
    setListError(null);
    listTherapySessions(token)
      .then(setSessions)
      .catch((err) => setListError(getErrorMessage(err, "Не удалось загрузить сессии.")))
      .finally(() => setIsLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || selectedId === null) {
      setSelectedJob(null);
      return;
    }
    setDetailTab("analysis");

    let cancelled = false;
    getTherapySession(token, selectedId)
      .then((job) => {
        if (!cancelled) setSelectedJob(job);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedId]);

  useEffect(() => {
    if (!token || selectedId === null) return;
    const job = selectedJob;
    if (!job || job.status === "done" || job.status === "error") return;

    const timer = window.setInterval(async () => {
      try {
        const status = await getTherapySessionStatus(token, selectedId);
        setSelectedJob((prev) => (prev ? { ...prev, ...status } : prev));
        setSessions((prev) =>
          prev.map((item) => (item.id === selectedId ? { ...item, ...status } : item)),
        );
        if (status.status === "done" || status.status === "error") {
          const full = await getTherapySession(token, selectedId);
          setSelectedJob(full);
          setSessions((prev) =>
            prev.map((item) => (item.id === selectedId ? { ...item, ...full } : item)),
          );
        }
      } catch {
        return;
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [token, selectedId, selectedJob?.status]);

  const analysis = useMemo(() => {
    const payload = selectedJob?.analysis_json;
    if (!payload || typeof payload !== "object") return null;
    if ("session_summary" in payload && typeof payload.session_summary === "string") {
      return payload as TherapySessionAnalysis;
    }
    return null;
  }, [selectedJob]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    setIsUploading(true);
    setError(null);
    try {
      const created =
        uploadMode === "text"
          ? await uploadTherapySessionText(token, {
              text: sessionText.trim(),
              title,
              sessionDate,
            })
          : await uploadTherapySession(token, {
              file: file!,
              title,
              sessionDate,
            });
      setSessions((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setSelectedJob(created);
      setFile(null);
      setSessionText("");
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(getErrorMessage(err, uploadMode === "text" ? "Не удалось отправить текст." : "Не удалось загрузить файл."));
    } finally {
      setIsUploading(false);
    }
  }

  const canSubmit =
    uploadMode === "text" ? sessionText.trim().length >= MIN_TEXT_LENGTH : Boolean(file);

  async function handleRetry(mode: "full" | "analysis") {
    if (!token || selectedId === null || isRetrying) return;
    setIsRetrying(true);
    try {
      const updated = await retryTherapySession(token, selectedId, mode);
      setSelectedJob(updated);
      setSessions((prev) => prev.map((item) => (item.id === selectedId ? { ...item, ...updated } : item)));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleDelete(jobId: number) {
    if (!token) return;
    setIsDeleting(true);
    try {
      await deleteTherapySession(token, jobId);
      setSessions((prev) => prev.filter((item) => item.id !== jobId));
      if (selectedId === jobId) {
        setSelectedId(null);
        setSelectedJob(null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 px-3 py-4 lg:gap-5 lg:px-5 lg:py-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Сессии с психологом</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Загрузите запись с диктофона или вставьте готовый текст — получите разметку спикеров и психологический разбор.
        </p>
      </div>

      {listError ? <LoadError message={listError} onRetry={reloadSessions} /> : null}
      {error ? <Notice variant="error">{error}</Notice> : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(220px,240px)_minmax(0,1fr)] lg:items-start lg:gap-5 xl:grid-cols-[minmax(240px,260px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Новая сессия</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-2">
                <Button
                  type="button"
                  variant={uploadMode === "audio" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUploadMode("audio")}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Аудио
                </Button>
                <Button
                  type="button"
                  variant={uploadMode === "text" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUploadMode("text")}
                >
                  <FileText className="mr-1 h-4 w-4" />
                  Текст
                </Button>
              </div>
              <form onSubmit={handleUpload}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="therapy-title">Название</FieldLabel>
                    <Input
                      id="therapy-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Сессия 11 июля"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="therapy-date">Дата сессии</FieldLabel>
                    <Input
                      id="therapy-date"
                      type="date"
                      value={sessionDate}
                      onChange={(event) => setSessionDate(event.target.value)}
                    />
                  </Field>
                  {uploadMode === "audio" ? (
                    <Field>
                      <FieldLabel htmlFor="therapy-file">Аудиофайл</FieldLabel>
                      <Input
                        ref={fileInputRef}
                        id="therapy-file"
                        type="file"
                        accept={acceptedFileTypes}
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                      />
                    </Field>
                  ) : (
                    <Field>
                      <FieldLabel htmlFor="therapy-text">Текст сессии</FieldLabel>
                      <Textarea
                        id="therapy-text"
                        value={sessionText}
                        onChange={(event) => setSessionText(event.target.value)}
                        placeholder="Вставьте расшифровку или заметки по сессии. Можно без разметки спикеров — ИИ разметит сам."
                        className="min-h-[180px] resize-y text-sm leading-6"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Минимум {MIN_TEXT_LENGTH} символов. Сейчас: {sessionText.trim().length}
                      </p>
                    </Field>
                  )}
                  <Button type="submit" disabled={!canSubmit || isUploading} className="w-full">
                    {isUploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : uploadMode === "text" ? (
                      <FileText className="mr-2 h-4 w-4" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    {uploadMode === "text" ? "Отправить текст" : "Загрузить и обработать"}
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">История</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Загрузка...
                </div>
              ) : sessions.length === 0 ? (
                <Empty title="Пока нет сессий" description="Загрузите аудио или вставьте текст сессии." />
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedId(session.id)}
                    aria-current={selectedId === session.id ? "true" : undefined}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                      selectedId === session.id ? "border-primary bg-muted/50" : "hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{session.title}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(session.created_at)}</div>
                      </div>
                      <StatusBadge status={session.status} />
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {!selectedJob ? (
            <Card>
              <CardContent className="py-12">
                <Empty title="Выберите сессию" description="Или добавьте новую — аудио или текст слева." />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selectedJob.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatSessionSource(selectedJob)}
                      {selectedJob.duration_sec > 0
                        ? ` · ${Math.round(selectedJob.duration_sec / 60)} мин`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {selectedJob.status === "error" ? (
                      <Button variant="outline" size="sm" onClick={() => handleRetry("full")} disabled={isRetrying}>
                        <RefreshCw className={cn("mr-1 h-4 w-4", isRetrying && "animate-spin")} /> Повторить
                      </Button>
                    ) : null}
                    {selectedJob.status === "done" ? (
                      <Button variant="outline" size="sm" onClick={() => handleRetry("analysis")} disabled={isRetrying}>
                        <RefreshCw className={cn("mr-1 h-4 w-4", isRetrying && "animate-spin")} /> Пересчитать анализ
                      </Button>
                    ) : null}
                    <ConfirmDeleteButton
                      ariaLabel="Удалить сессию"
                      confirmTitle="Удалить сессию?"
                      confirmDescription="Запись, расшифровка и анализ будут удалены без возможности восстановления."
                      pending={isDeleting}
                      onConfirm={() => handleDelete(selectedJob.id)}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <SessionProgress job={selectedJob} />
                  {selectedJob.error ? <Notice variant="error" className="mt-4">{selectedJob.error}</Notice> : null}
                </CardContent>
              </Card>

              {selectedJob.status === "done" ? (
                <>
                  <div className="flex gap-2">
                    <Button
                      variant={detailTab === "analysis" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDetailTab("analysis")}
                    >
                      Анализ
                    </Button>
                    <Button
                      variant={detailTab === "transcript" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDetailTab("transcript")}
                    >
                      Транскрипт
                    </Button>
                  </div>
                  {detailTab === "analysis" ? (
                    <SessionAnalysisPanel analysis={analysis} markdown={selectedJob.analysis_markdown} />
                  ) : (
                    <SessionTranscriptPanel transcript={selectedJob.diarized_transcript || selectedJob.transcript} />
                  )}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Notice variant="info">
        Это вспомогательный разбор на основе расшифровки. Не заменяет профессиональную супервизию или диагностику.
      </Notice>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "done" ? "default" : status === "processing" ? "secondary" : "outline";
  const label =
    status === "done"
      ? "Готово"
      : status === "error"
        ? "Ошибка"
        : status === "processing"
          ? "Обработка"
          : "В очереди";
  return (
    <Badge variant={variant} className={status === "error" ? "border-destructive text-destructive" : undefined}>
      {label}
    </Badge>
  );
}
