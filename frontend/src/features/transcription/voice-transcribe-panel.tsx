"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Copy, Loader2, Mic, Square, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useRequireAuth } from "@/hooks/use-auth";
import { formatRecordingDuration, useVoiceInput } from "@/hooks/use-voice-input";
import { createEntry, getAssistantAgentStatus, getErrorMessage, listEntries } from "@/lib/api";
import { getString } from "@/lib/entry-helpers";

const ACCEPTED_AUDIO = "audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,audio/x-wav,.webm,.ogg,.mp3,.m4a,.wav";

type TranscriptMessage = {
  id: string;
  text: string;
  createdAt: Date;
  source: "recording" | "file";
  label?: string;
  entryId?: string;
};

const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

export function VoiceTranscribePanel() {
  const { token } = useRequireAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFileRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState<boolean | null>(null);
  const [whisperModel, setWhisperModel] = useState("");

  useEffect(() => {
    if (!token) {
      setMessages([]);
      return;
    }
    let mounted = true;
    void listEntries(token, { type: "note", kind: "voice_transcript", limit: 100 })
      .then((result) => {
        if (!mounted) {
          return;
        }
        setMessages(
          [...result.items]
            .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
            .map((entry) => ({
              id: entry.id,
              entryId: entry.id,
              text: entry.content,
              createdAt: new Date(entry.created_at),
              source: getString(entry.metadata.source_file) ? ("file" as const) : ("recording" as const),
              label: getString(entry.metadata.source_file) || undefined,
            })),
        );
      })
      .catch(() => {
        if (mounted) {
          setMessages([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) {
      setSpeechReady(null);
      return;
    }
    let mounted = true;
    void getAssistantAgentStatus(token)
      .then((status) => {
        if (!mounted) {
          return;
        }
        setSpeechReady(status.speech_enabled && status.speech_configured);
        setWhisperModel(status.whisper_model);
      })
      .catch(() => {
        if (mounted) {
          setSpeechReady(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  async function persistTranscript(value: string, source: TranscriptMessage["source"], label?: string) {
    if (!token) {
      appendTranscriptLocal(value, source, label);
      return;
    }
    try {
      const created = await createEntry(token, {
        type: "note",
        title: source === "file" ? `Транскрипт · ${label ?? "аудио"}` : "Голосовая транскрипция",
        content: value,
        metadata: {
          kind: "voice_transcript",
          source: "transcription",
          source_file: label ?? null,
        },
      });
      setMessages((current) => [
        ...current,
        {
          id: created.id,
          entryId: created.id,
          text: value,
          createdAt: new Date(created.created_at),
          source,
          label,
        },
      ]);
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось сохранить транскрипт."));
      appendTranscriptLocal(value, source, label);
    }
  }

  function appendTranscriptLocal(value: string, source: TranscriptMessage["source"], label?: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text: trimmed,
        createdAt: new Date(),
        source,
        label,
      },
    ]);
    setError(null);
  }

  function appendTranscript(value: string, source: TranscriptMessage["source"], label?: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    void persistTranscript(trimmed, source, label);
  }

  const {
    isRecording,
    isTranscribing,
    recordingSeconds,
    toggleRecording,
    stopRecording,
    transcribeFile,
  } = useVoiceInput({
    token,
    onTranscribed: (text) => {
      appendTranscript(text, pendingFileRef.current ? "file" : "recording", pendingFileRef.current ?? undefined);
      pendingFileRef.current = null;
    },
    onError: (message) => {
      pendingFileRef.current = null;
      setError(message);
    },
    disabled: speechReady === false,
  });

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, isRecording, isTranscribing]);

  async function handleCopyAll() {
    const combined = messages.map((message) => message.text).join("\n\n");
    if (!combined.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(combined);
      setCopyNotice("Весь чат скопирован");
      window.setTimeout(() => setCopyNotice(null), 2000);
    } catch {
      setError("Не удалось скопировать текст");
    }
  }

  async function handleCopyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice("Скопировано");
      window.setTimeout(() => setCopyNotice(null), 1500);
    } catch {
      setError("Не удалось скопировать сообщение");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    pendingFileRef.current = file.name;
    transcribeFile(file);
  }

  const canRecord = Boolean(token) && speechReady !== false && !isTranscribing;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 lg:px-6">
        <Badge variant={speechReady ? "secondary" : "outline"}>
          Whisper{whisperModel ? ` · ${whisperModel}` : ""}
        </Badge>
        {speechReady === null ? (
          <span className="text-sm text-muted-foreground">Проверяем распознавание…</span>
        ) : speechReady ? (
          <span className="text-sm text-muted-foreground">готов</span>
        ) : (
          <span className="text-sm text-muted-foreground">не настроен</span>
        )}
      </div>

      {speechReady === false ? (
        <div className="px-4 py-3 lg:px-6">
          <Notice variant="info">
            Распознавание речи выключено. В backend/.env включите SPEECH_ENABLED=true и задайте WHISPER_MODEL.
          </Notice>
        </div>
      ) : null}

      <div ref={scrollRef} className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {messages.length === 0 && !isRecording && !isTranscribing ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Запишите голос или загрузите аудио — каждая транскрипция появится отдельным сообщением в этом чате.
            </p>
          ) : null}

          {messages.map((message) => (
            <article
              key={message.id}
              className="group max-w-[92%] rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {message.source === "file" ? `Файл · ${message.label ?? "аудио"}` : "Голосовая запись"} ·{" "}
                  {timeFormatter.format(message.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyMessage(message.text)}
                  className="focus-ring rounded-md p-1 opacity-70 transition hover:opacity-100"
                  aria-label="Скопировать сообщение"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{message.text}</p>
            </article>
          ))}

          {isRecording ? (
            <div className="max-w-[92%] rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <span className="size-2 animate-pulse rounded-full bg-destructive" />
                Идёт запись · {formatRecordingDuration(recordingSeconds)}
              </div>
              <p className="mt-1 text-muted-foreground">Нажмите «Стоп», когда закончите говорить.</p>
            </div>
          ) : null}

          {isTranscribing ? (
            <div className="max-w-[70%] rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Распознаю речь…
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border bg-card/80 px-4 py-3 backdrop-blur lg:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {error ? <Notice variant="error">{error}</Notice> : null}
          {copyNotice ? <Notice variant="success">{copyNotice}</Notice> : null}

          <div className="flex flex-wrap items-center gap-2">
            {isRecording ? (
              <Button type="button" variant="destructive" onClick={() => stopRecording()} className="animate-pulse">
                <Square data-icon="inline-start" />
                Стоп
              </Button>
            ) : (
              <Button type="button" onClick={() => void toggleRecording()} disabled={!canRecord}>
                {isTranscribing ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Mic data-icon="inline-start" />
                )}
                Записать
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canRecord}
            >
              <Upload data-icon="inline-start" />
              Аудио
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_AUDIO}
              className="hidden"
              onChange={handleFileChange}
            />

            <Button type="button" variant="outline" onClick={() => void handleCopyAll()} disabled={messages.length === 0}>
              <Copy data-icon="inline-start" />
              Копировать всё
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMessages([]);
                setError(null);
                setCopyNotice(null);
              }}
              disabled={messages.length === 0}
            >
              <Trash2 data-icon="inline-start" />
              Очистить чат
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Скопируйте нужные сообщения или весь чат и вставьте куда угодно. Форматы: .webm, .mp3, .wav (до ~25 МБ).
          </p>
        </div>
      </div>
    </div>
  );
}
