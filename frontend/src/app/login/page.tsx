"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-logo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth, completeAuthRedirect } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";
import { DEMO_ACCOUNT } from "@/lib/demo-account";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-8">
          <BrandWordmark showTagline className="rounded-xl px-2" />
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { token, user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function redirectAfterAuth() {
    const next = searchParams.get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    completeAuthRedirect(target);
  }

  useEffect(() => {
    if (!token || !user) {
      return;
    }
    redirectAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  async function loginAsDemo() {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
      redirectAfterAuth();
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

    try {
      await login(normalizedEmail, password);
      redirectAfterAuth();
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Не удалось войти."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-8">
      <BrandWordmark showTagline className="rounded-xl px-2" />
      <Card className="w-full max-w-md border-primary/15 shadow-panel">
        <CardHeader>
          <h1 className="sr-only">{BRAND_NAME}</h1>
          <p className="text-sm text-muted-foreground">Вход в личный пульт</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} aria-describedby={error ? "auth-error" : undefined}>
            <FieldGroup>
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

              <Field>
                <FieldLabel htmlFor="password">Пароль</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
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
                {isSubmitting ? "Подождите" : "Войти"}
              </Button>

              {process.env.NODE_ENV !== "production" ? (
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
