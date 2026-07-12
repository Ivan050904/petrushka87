"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, MessageSquareText, Send, Sparkles, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { LoadError } from "@/components/load-error";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { VoiceInputButton } from "@/features/assistant/voice-input-button";
import { useAuth } from "@/hooks/use-auth";
import {
  createAssistantConversation,
  deleteAssistantConversation,
  getAssistantConversation,
  getErrorMessage,
  listAssistantConversations,
  streamAssistantChat,
  updateAssistantConversation,
  type AssistantConversation,
} from "@/lib/api";
import { ROUTES } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ASSISTANT_SCOPES = [
  { value: "all", label: "Вся память" },
  { value: "notes", label: "Заметки" },
  { value: "plans", label: "Планы" },
  { value: "finance", label: "Финансы" },
  { value: "people", label: "Люди" },
  { value: "transcription", label: "Транскрипции" },
  { value: "therapy", label: "Сессии" },
  { value: "kanban", label: "Канбан" },
  { value: "workouts", label: "Зал" },
] as const;

const DEFAULT_CONVERSATION_TITLE = "Новый диалог";

function deriveConversationTitle(text: string, maxLength = 80) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function scopeLabel(scope: string) {
  return ASSISTANT_SCOPES.find((item) => item.value === scope)?.label ?? scope;
}

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
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [newScope, setNewScope] = useState<string>("all");
  const [newChatTitle, setNewChatTitle] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
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

  const reloadConversations = useCallback(async () => {
    if (!token) {
      return;
    }
    setConversationsLoading(true);
    setListError(null);
    try {
      const items = await listAssistantConversations(token);
      setConversations(items);
      if (items.length > 0) {
        const firstId = items[0].id;
        setActiveConversationId(firstId);
        const detail = await getAssistantConversation(token, firstId);
        setMessages(
          detail.messages.map((message) => ({
            id: message.id,
            role: message.role as "user" | "assistant",
            content: message.content,
          })),
        );
      } else {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setListError(getErrorMessage(err, "Не удалось загрузить диалоги."));
    } finally {
      setConversationsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void reloadConversations();
  }, [token, reloadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  useEffect(() => {
    setTitleDraft(activeConversation?.title ?? "");
  }, [activeConversation?.id, activeConversation?.title]);

  function applyConversationTitle(conversationId: string, title: string) {
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, title } : conversation,
      ),
    );
    if (conversationId === activeConversationId) {
      setTitleDraft(title);
    }
  }

  async function renameConversation(conversationId: string, nextTitle: string) {
    if (!token) {
      return;
    }
    const trimmed = nextTitle.trim();
    if (!trimmed) {
      return;
    }
    const current = conversations.find((conversation) => conversation.id === conversationId);
    if (current?.title === trimmed) {
      return;
    }

    setIsSavingTitle(true);
    try {
      const updated = await updateAssistantConversation(token, conversationId, { title: trimmed });
      applyConversationTitle(conversationId, updated.title);
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить название."));
      setTitleDraft(current?.title ?? "");
    } finally {
      setIsSavingTitle(false);
    }
  }

  async function ensureConversation(seedTitle?: string): Promise<string> {
    if (!token) {
      throw new Error("Требуется вход");
    }
    if (activeConversationId) {
      return activeConversationId;
    }
    const title =
      newChatTitle.trim() ||
      (seedTitle ? deriveConversationTitle(seedTitle) : DEFAULT_CONVERSATION_TITLE);
    const created = await createAssistantConversation(token, { scope: newScope, title });
    setConversations((prev) => [created, ...prev]);
    setActiveConversationId(created.id);
    setNewChatTitle("");
    setTitleDraft(created.title);
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
      const title = newChatTitle.trim() || DEFAULT_CONVERSATION_TITLE;
      const created = await createAssistantConversation(token, { scope: newScope, title });
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setMessages([]);
      setTitleDraft(created.title);
      setNewChatTitle("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function removeActiveConversation() {
    if (!token || !activeConversationId) {
      return;
    }
    setError(null);
    try {
      await deleteAssistantConversation(token, activeConversationId);
      setConversations((prev) => prev.filter((item) => item.id !== activeConversationId));
      setActiveConversationId(null);
      setMessages([]);
      await reloadConversations();
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
    const shouldRenameAfterSend =
      activeConversation?.title === DEFAULT_CONVERSATION_TITLE && !newChatTitle.trim();

    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const conversationId = await ensureConversation(
        !activeConversationId && !newChatTitle.trim() ? question : undefined,
      );
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

      if (shouldRenameAfterSend) {
        await renameConversation(conversationId, deriveConversationTitle(question));
      }
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

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  async function handleTitleBlur() {
    if (!activeConversationId) {
      return;
    }
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE);
      return;
    }
    await renameConversation(activeConversationId, trimmed);
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row md:p-6">
        <aside className="flex w-full shrink-0 flex-col gap-3 md:w-64">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Чат с контекстом</h1>
              <p className="text-xs text-muted-foreground">Поиск по памяти, не действия.</p>
            </div>
          </div>

          <details className="rounded-xl border border-border bg-card md:border-0 md:bg-transparent">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:content-none md:hidden">
              Чаты и настройки
            </summary>
            <div className="flex flex-col gap-3 border-t border-border p-4 md:border-0 md:p-0">
              <p className="text-xs text-muted-foreground">
                Для создания задач используйте{" "}
                <Link href={ROUTES.dashboard} className="inline-flex items-center gap-1 underline underline-offset-2">
                  <Sparkles className="size-3" />
                  агента на «Сегодня»
                </Link>
                .
              </p>

          <FieldLabel htmlFor="assistant-scope" className="text-xs">
            Область нового чата
          </FieldLabel>
          <Select id="assistant-scope" value={newScope} onChange={(event) => setNewScope(event.target.value)}>
            {ASSISTANT_SCOPES.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </Select>

          <FieldLabel htmlFor="assistant-new-title" className="text-xs">
            Название чата
          </FieldLabel>
          <Input
            id="assistant-new-title"
            value={newChatTitle}
            onChange={(event) => setNewChatTitle(event.target.value)}
            placeholder="Необязательно — подставится из первого сообщения"
            maxLength={200}
          />

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-10 flex-1" onClick={() => void startNewConversation()}>
              Новый чат
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-10 min-w-10"
              disabled={!activeConversationId}
              aria-label="Удалить диалог"
              onClick={() => void removeActiveConversation()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {listError ? <LoadError message={listError} onRetry={() => void reloadConversations()} /> : null}

          <div className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto md:flex">
            {conversationsLoading ? (
              <p className="text-sm text-muted-foreground">Загрузка диалогов…</p>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Диалогов пока нет.</p>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void switchConversation(conversation.id)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted",
                    conversation.id === activeConversationId && "bg-muted font-medium",
                  )}
                >
                  <span className="block truncate">{conversation.title || DEFAULT_CONVERSATION_TITLE}</span>
                  <span className="text-xs text-muted-foreground">{scopeLabel(conversation.scope)}</span>
                </button>
              ))
            )}
          </div>
            </div>
          </details>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2 md:hidden">
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
                      {conversation.title || DEFAULT_CONVERSATION_TITLE} ({scopeLabel(conversation.scope)})
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>

          {contextDebug ? <p className="text-xs text-muted-foreground/80">{contextDebug}</p> : null}

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card">
          {activeConversation ? (
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <FieldLabel htmlFor="assistant-active-title" className="sr-only">
                Название диалога
              </FieldLabel>
              <Input
                id="assistant-active-title"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => void handleTitleBlur()}
                onKeyDown={handleTitleKeyDown}
                disabled={isSavingTitle}
                maxLength={200}
                className="max-w-xl flex-1"
                placeholder="Название чата"
              />
              <span className="text-xs text-muted-foreground">{scopeLabel(activeConversation.scope)}</span>
            </div>
          ) : null}
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

          <form onSubmit={handleSubmit} className="sticky bottom-0 flex items-end gap-2 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
      </div>
    </AppShell>
  );
}
