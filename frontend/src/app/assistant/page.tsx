"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Send } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { BRAND_NAME } from "@/lib/brand";
import { ROUTES } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export default function AssistantPage() {
  const { token, isLoading } = useAuth();
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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
        onError: (message) => setError(message),
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
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
          <h1 className="text-xl font-semibold">Ассистент</h1>
          <p className="text-sm text-muted-foreground">
            Войдите в {BRAND_NAME}, чтобы задавать вопросы по заметкам, планам и транскрипциям.
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
            <h1 className="text-xl font-semibold">Ассистент</h1>
            <p className="text-sm text-muted-foreground">
              Знает ваши заметки, планы и транскрипции ({activeConversation?.scope ?? "all"})
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Спросите, например: «Что я планировал на эту неделю?» или «О чём было последнее видео?»
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {message.content || (loading && message.role === "assistant" ? "…" : "")}
                </div>
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
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              placeholder="Задайте вопрос ассистенту…"
              className="min-h-[44px] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" disabled={loading || !draft.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
