"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { DEMO_ACCOUNT } from "@/lib/demo-account";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { token, login, register, isLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
  }

  useEffect(() => {
    if (!isLoading && token) {
      router.replace("/dashboard");
    }
  }, [isLoading, router, token]);

  async function loginAsDemo() {
    setMode("login");
    setError(null);
    setIsSubmitting(true);
    try {
      await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
      router.replace("/dashboard");
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Демо-аккаунт недоступен. Запустите seed: python backend/scripts/seed_demo.py",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim();
    const fallbackError = mode === "login" ? "Не удалось войти." : "Не удалось создать аккаунт.";

    try {
      if (mode === "login") {
        await login(normalizedEmail, password);
      } else {
        await register(normalizedEmail, password, normalizedFullName || undefined);
      }
      router.replace("/dashboard");
    } catch (requestError) {
      setError(getErrorMessage(requestError, fallbackError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-8">
      <BrandWordmark width={220} className="rounded-xl shadow-panel" />
      <Card className="w-full max-w-md border-primary/15 shadow-panel">
        <CardHeader>
          <h1 className="sr-only">LetsCore</h1>
          <p className="text-sm text-muted-foreground">Вход в личный пульт</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} aria-describedby={error ? "auth-error" : undefined}>
            <FieldGroup>
              <div
                className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted p-1"
                role="group"
                aria-label="Режим авторизации"
              >
                <Button
                  type="button"
                  variant={mode === "login" ? "secondary" : "ghost"}
                  aria-pressed={mode === "login"}
                  onClick={() => switchMode("login")}
                  disabled={isSubmitting}
                >
                  Вход
                </Button>
                <Button
                  type="button"
                  variant={mode === "register" ? "secondary" : "ghost"}
                  aria-pressed={mode === "register"}
                  onClick={() => switchMode("register")}
                  disabled={isSubmitting}
                >
                  Регистрация
                </Button>
              </div>

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={isSubmitting}
                  required
                />
              </Field>

              {mode === "register" ? (
                <Field>
                  <FieldLabel htmlFor="full-name">Имя</FieldLabel>
                  <Input
                    id="full-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    autoComplete="name"
                    disabled={isSubmitting}
                  />
                </Field>
              ) : null}

              <Field>
                <FieldLabel htmlFor="password">Пароль</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    minLength={mode === "register" ? 8 : 1}
                    disabled={isSubmitting}
                    required
                    className="pr-14"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    className="focus-ring absolute right-1 top-1/2 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={isSubmitting}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                  </button>
                </div>
              </Field>

              {error ? <FieldError id="auth-error">{error}</FieldError> : null}

              <Button type="submit" disabled={isSubmitting} className="w-full">
                <LogIn data-icon="inline-start" />
                {isSubmitting ? "Подождите" : mode === "login" ? "Войти" : "Создать аккаунт"}
              </Button>

              {mode === "login" ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    className="w-full"
                    onClick={() => void loginAsDemo()}
                  >
                    Войти в демо
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    {DEMO_ACCOUNT.email} · пароль {DEMO_ACCOUNT.password}
                  </p>
                </div>
              ) : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
