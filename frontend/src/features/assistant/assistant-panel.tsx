"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Check, MessageSquareText, SendHorizonal, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputButton } from "@/features/assistant/voice-input-button";
import { assistantAgentChat, getAssistantAgentStatus, getErrorMessage } from "@/lib/api";
import type { AssistantAgentChatResponse } from "@/lib/api";
import { entryModuleHref } from "@/lib/entry-helpers";
import { plansHref, ROUTES } from "@/lib/navigation";
import type { Entry } from "@/lib/types";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAgentChatResponse["actions"];
  entriesPreview?: AssistantAgentChatResponse["entries_preview"];
};

type AssistantPanelProps = {
  token: string | null;
  onChanged?: () => void | Promise<void>;
  className?: string;
};

export function AssistantPanel({ token, onChanged, className }: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<
    AssistantAgentChatResponse["pending_confirmation"]
  >(null);
  const [configured, setConfigured] = useState(true);
  const [providerReachable, setProviderReachable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (!token) {
      return;
    }
    void getAssistantAgentStatus(token)
      .then((status) => {
        setConfigured(status.configured);
        setProviderReachable(status.provider_reachable);
      })
      .catch(() => {
        setConfigured(false);
        setProviderReachable(false);
      });
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage(message: string, confirm = false) {
    if (!token || !message.trim() || isSending || !configured) {
      return;
    }

    const trimmed = message.trim();
    if (!confirm) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
      setInput("");
    }
    setError(null);
    setIsSending(true);

    try {
      const response = await assistantAgentChat(token, {
        message: trimmed,
        session_id: sessionId,
        confirm,
      });
      setSessionId(response.session_id);
      setConfigured(response.configured);
      setPendingConfirmation(response.pending_confirmation);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.reply,
          actions: response.actions,
          entriesPreview: response.entries_preview,
        },
      ]);
      if (response.actions.length > 0) {
        await onChanged?.();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось отправить сообщение ассистенту."));
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm",
        className,
      )}
      aria-label="Агент действий"
    >
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Агент действий</h2>
          <p className="text-xs text-muted-foreground">
            {!configured
              ? "Добавьте ASSISTANT_API_KEY в backend/.env"
              : providerReachable === false
                ? "Модель недоступна — проверьте токен GitHub"
                : "Создаёт задачи и встречи. Для поиска по памяти — "}
            {configured && providerReachable !== false ? (
              <Link href={ROUTES.assistant} className="underline underline-offset-2">
                чат с контекстом
              </Link>
            ) : null}
            {configured && providerReachable !== false ? "." : null}
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="hidden shrink-0 lg:inline-flex">
          <Link href={ROUTES.assistant}>
            <MessageSquareText data-icon="inline-start" className="size-3.5" />
            Чат
          </Link>
        </Button>
        {!configured ? <Badge variant="secondary">Не настроен</Badge> : null}
        {configured && providerReachable === false ? (
          <Badge variant="secondary">Нет связи</Badge>
        ) : null}
      </header>

      <div ref={scrollRef} className="scrollbar-hidden min-h-[180px] max-h-[320px] flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Например: «Создай задачу купить молоко» или «Встреча с Иваном завтра в 15:00, Zoom».
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.actions && message.actions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <Link
                        key={action.entry_id ?? action.title}
                        href={
                          action.entry_id
                            ? entryModuleHref({
                                id: action.entry_id,
                                type: action.type,
                                title: action.title,
                                content: action.title,
                                metadata: action.metadata,
                                created_at: "",
                                updated_at: "",
                              } satisfies Entry)
                            : plansHref()
                        }
                        className="focus-ring inline-flex items-center rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground"
                      >
                        {action.type === "event" ? "Встреча" : "Задача"}: {action.title}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {isSending ? (
              <div className="max-w-[70%] rounded-2xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                Думаю…
              </div>
            ) : null}
          </div>
        )}
      </div>

      {error ? (
        <div className="px-4 pb-2">
          <Notice variant="error">{error}</Notice>
        </div>
      ) : null}

      {!configured ? (
        <div className="px-4 pb-2">
          <Notice variant="info">Ассистент не настроен. Добавьте ASSISTANT_API_KEY в backend/.env</Notice>
        </div>
      ) : null}

      {pendingConfirmation ? (
        <div className="flex flex-wrap gap-2 border-t border-border/70 px-4 py-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void sendMessage("да", true)}
            disabled={isSending || !token}
          >
            <Check data-icon="inline-start" className="size-3.5" />
            Подтвердить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPendingConfirmation(null)}
            disabled={isSending}
          >
            Отмена
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-2 border-t border-border/70 p-3">
        <VoiceInputButton
          token={token}
          disabled={isSending || !configured}
          onTranscribed={(text) => setInput((current) => (current ? `${current} ${text}` : text))}
          onError={setError}
        />
        <FieldLabel htmlFor={inputId} className="sr-only">
          Сообщение агенту
        </FieldLabel>
        <Textarea
          id={inputId}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Создать задачу или встречу…"
          rows={1}
          disabled={!token || isSending || !configured}
          className="min-h-10 resize-none"
        />
        <Button
          type="button"
          size="icon"
          aria-label="Отправить"
          disabled={!token || !input.trim() || isSending || !configured}
          onClick={() => void sendMessage(input)}
        >
          <SendHorizonal aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </section>
  );
}
