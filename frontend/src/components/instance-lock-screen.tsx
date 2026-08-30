"use client";

import * as React from "react";
import { Loader2, LockKeyhole, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiConnectionError,
  ApiError,
  api,
  clearInstanceToken,
  getInstanceToken,
  setInstanceToken,
} from "@/lib/api-client";

type GateState = "checking" | "locked" | "open";

export function InstanceLockScreen({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<GateState>("checking");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const verifyToken = React.useCallback(async (token: string) => {
    setInstanceToken(token);
    await api.get<{ status: string }>("/ready", "Неверный пароль");
  }, []);

  React.useEffect(() => {
    const existing = getInstanceToken();
    if (!existing) {
      setState("locked");
      return;
    }
    let cancelled = false;
    verifyToken(existing)
      .then(() => {
        if (!cancelled) setState("open");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearInstanceToken();
          setError(cause.message || "Неверный пароль");
          setState("locked");
          return;
        }
        setError(
          cause instanceof ApiConnectionError
            ? "Не удалось связаться с API. Проверьте, что сервер запущен."
            : "Не удалось проверить доступ к API.",
        );
        setState("locked");
      });
    return () => {
      cancelled = true;
    };
  }, [verifyToken]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPassword = password.trim();
    if (!nextPassword) {
      setError("Введите пароль");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await verifyToken(nextPassword);
      setPassword("");
      setState("open");
    } catch (cause) {
      clearInstanceToken();
      if (cause instanceof ApiError && cause.status === 401) {
        setError(cause.message || "Неверный пароль");
      } else if (cause instanceof ApiConnectionError) {
        setError("Не удалось связаться с API. Проверьте, что сервер запущен.");
      } else {
        setError("Не удалось войти. Попробуйте ещё раз.");
      }
      setState("locked");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "open") return <>{children}</>;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-600 text-primary-foreground shadow-sm">
            <PawPrint className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">VetDietDerm</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Введите пароль инстанса, чтобы открыть рабочее место.
          </p>
        </div>

        {state === "checking" ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Проверка доступа…
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="instance-password">Пароль инстанса</Label>
              <Input
                id="instance-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                aria-invalid={Boolean(error)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              Войти
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
