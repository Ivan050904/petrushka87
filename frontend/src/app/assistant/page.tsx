"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Check, Copy, Loader2, Send } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { VoiceInputButton } from "@/features/assistant/voice-input-button";
import { useAuth } from "@/hooks/use-auth";
import {
  createAssistantConversation,
  getAssistantConversation,
  getErrorMessage,
  listAssistantConversations,
  streamAssistantChat,
  type AssistantConversation,
} from "@/lib/api";
import { ROUTES } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function ChatMessageBubble({
  message,
  loading,
  copiedMessageId,
  onCopy,
}: {
  message: ChatMessage;
  loading: boolean;
  copiedMessageId: string | null;
  onCopy: (message: ChatMessage) => void;
}) {
  const content = message.content || (loading && message.role === "assistant" ? "…" : "");
  const canCopy = Boolean(message.content.trim());

  return (
    <div
      className={cn(
        "group relative max-w-[85%]",
        message.role === "user" ? "ml-auto" : "mr-auto",
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl px-4 py-3 pr-10 text-sm whitespace-pre-wrap",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {content}
        {canCopy ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "absolute top-1.5 right-1.5 size-11 opacity-100 transition-opacity sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
              message.role === "user" && "text-primary-foreground/80 hover:text-primary-foreground",
            )}
            aria-label="Скопировать сообщение"
            onClick={() => onCopy(message)}
          >
            {copiedMessageId === message.id ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const { token, isLoading } = useAuth();
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextDebug, setContextDebug] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const copyResetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    void listAssistantConversations(token)
      .then(async (items) => {
        setConversations(items);
        if (items.length > 0) {
          setActiveConversationId(items[0].id);
          const detail = await getAssistantConversation(token, items[0].id);
          setMessages(
            detail.messages.map((message) => ({
              id: message.id,
              role: message.role as "user" | "assistant",
              content: message.content,
            })),
          );
        }
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  async function ensureConversation(): Promise<string> {
    if (!token) {
      throw new Error("Требуется вход");
    }
    if (activeConversationId) {
      return activeConversationId;
    }
    const created = await createAssistantConversation(token);
    setConversations((prev) => [created, ...prev]);
    setActiveConversationId(created.id);
    return created.id;
  }

  async function switchConversation(conversationId: string) {
    if (!token || conversationId === activeConversationId) {
      return;
    }
    setActiveConversationId(conversationId);
    setError(null);
    try {
      const detail = await getAssistantConversation(token, conversationId);
      setMessages(
        detail.messages.map((message) => ({
          id: message.id,
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function startNewConversation() {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const created = await createAssistantConversation(token);
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setMessages([]);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function sendMessage() {
    if (!token || !draft.trim() || loading) {
      return;
    }

    const question = draft.trim();
    setDraft("");
    setError(null);
    setLoading(true);

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const conversationId = await ensureConversation();
      let assistantText = "";
      const assistantId = `local-assistant-${Date.now()}`;
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      await streamAssistantChat(token, conversationId, question, {
        onToken: (text) => {
          assistantText += text;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId ? { ...message, content: assistantText } : message,
            ),
          );
        },
        onDone: (payload) => {
          if (payload.debug && process.env.NODE_ENV === "development") {
            const scopes =
              payload.debug.searched_scopes && payload.debug.searched_scopes.length > 0
                ? ` · модули: ${payload.debug.searched_scopes.join(", ")}`
                : "";
            const dates =
              payload.debug.matched_dates.length > 0
                ? ` · даты: ${payload.debug.matched_dates.join(", ")}`
                : "";
            setContextDebug(
              `Контекст: ${payload.debug.snippet_count} фрагментов${scopes}${dates}`,
            );
          }
        },
        onError: (message) => setError(message),
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await sendMessage();
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    void sendMessage();
  }

  async function handleCopyMessage(message: ChatMessage) {
    if (!message.content.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
      copyResetRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
      }, 1500);
    } catch {
      setError("Не удалось скопировать текст");
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Загрузка ассистента…</p>
      </AppShell>
    );
  }

  if (!token) {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
          <h1 className="text-xl font-semibold">Чат с контекстом</h1>
          <p className="text-sm text-muted-foreground">
            RAG-чат по заметкам, планам и транскрипциям. Для действий на дашборде используйте панель «Агент».
          </p>
          <Button asChild>
            <Link href={ROUTES.login}>Войти</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell contentClassName="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Чат с контекстом</h1>
            <p className="text-sm text-muted-foreground">
              RAG-чат по вашим данным ({activeConversation?.scope ?? "all"}). Агент-действия — на дашборде.
            </p>
            {contextDebug ? (
              <p className="text-xs text-muted-foreground/80">{contextDebug}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {conversations.length > 0 ? (
            <div className="min-w-[220px] flex-1">
              <FieldLabel htmlFor="assistant-conversation" className="sr-only">
                Диалог
              </FieldLabel>
              <Select
                id="assistant-conversation"
                value={activeConversationId ?? ""}
                onChange={(event) => void switchConversation(event.target.value)}
                className="min-h-11"
              >
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title || "Диалог"}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void startNewConversation()}>
            Новый чат
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Спросите, например: «Что я планировал на эту неделю?» или «О чём было последнее видео?»
              </p>
            ) : (
              messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  loading={loading}
                  copiedMessageId={copiedMessageId}
                  onCopy={handleCopyMessage}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {error ? <p className="px-4 text-sm text-destructive">{error}</p> : null}

          <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t p-4">
            <VoiceInputButton
              token={token}
              disabled={loading}
              onTranscribed={(text) => setDraft((current) => (current ? `${current} ${text}` : text))}
              onError={setError}
            />
            <FieldLabel htmlFor="assistant-message" className="sr-only">
              Сообщение ассистенту
            </FieldLabel>
            <textarea
              id="assistant-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleDraftKeyDown}
              rows={2}
              placeholder="Задайте вопрос ассистенту…"
              aria-describedby="assistant-message-hint"
              className="min-h-[44px] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span id="assistant-message-hint" className="sr-only">
              Enter — отправить, Shift+Enter — новая строка
            </span>
            <Button
              type="submit"
              disabled={loading || !draft.trim()}
              aria-label="Отправить сообщение"
              className="size-11 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
