"use client";

import { LogOut, Palette, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";

function userInitials(fullName: string | null | undefined, email: string | null | undefined) {
  const source = (fullName || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="mt-1 text-sm text-muted-foreground">Аккаунт и параметры приложения.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserRound aria-hidden="true" className="size-5" />
            Профиль
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-semibold"
          >
            {userInitials(user?.full_name, user?.email)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{user?.full_name || "Пользователь"}</div>
            <div className="truncate text-sm text-muted-foreground">{user?.email || "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette aria-hidden="true" className="size-5" />
            Оформление
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Выберите светлую или тёмную тему для всего приложения.</p>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings aria-hidden="true" className="size-5" />
            Ассистент
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Ключ и модель LLM задаются в <code className="rounded bg-muted px-1">backend/.env</code> (NOTES_AI_* или OPENAI_COMPATIBLE_*).</p>
          <p>Лимиты контекста: CONTEXT_LLM_MAX_CHARS, CONTEXT_SNIPPET_LIMIT, CONTEXT_ENTITY_MATCH_LIMIT.</p>
        </CardContent>
      </Card>

      <Button type="button" variant="outline" className="w-fit gap-2" onClick={handleLogout}>
        <LogOut aria-hidden="true" className="size-4" />
        Выйти
      </Button>
      </div>
    </AppShell>
  );
}
