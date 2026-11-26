"use client";

import * as React from "react";
import type { components } from "@vetdietderm/api-contract";
import { useAuth } from "@/features/authentication/auth-provider";
import { apiRequest } from "@/shared/api/client";
import { apiErrorMessage } from "@/shared/api/error-message";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

type ClinicBot = components["schemas"]["ClinicBotRead"];

const statusLabels = {
  connected: "Подключён",
  error: "Ошибка",
  disconnected: "Отключён",
} as const;

const webhookLabels = {
  not_configured: "Вебхук не настроен",
  active: "Вебхук активен",
  error: "Ошибка вебхука",
} as const;

export function ClinicBotSettings() {
  const { user } = useAuth();
  const role = user?.organization?.org_role;
  const canManage = role === "owner" || role === "admin";
  const [bot, setBot] = React.useState<ClinicBot | null>(null);
  const [token, setToken] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [formError, setFormError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setBot(await apiRequest<ClinicBot>("/clinic-bot"));
    } catch (cause) {
      setLoadError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function updateBot(action: () => Promise<ClinicBot>) {
    setBusy(true);
    setFormError("");
    try {
      setBot(await action());
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      await load();
      setBusy(false);
    }
  }

  function connect(event: React.FormEvent) {
    event.preventDefault();
    const next = token.trim();
    if (!next || busy || loading) return;
    void updateBot(async () => {
      const saved = await apiRequest<ClinicBot>("/clinic-bot", { method: "PUT", body: { token: next } });
      setToken("");
      return saved;
    });
  }

  const status = bot?.status ? statusLabels[bot.status] : "Не подключён";
  const webhookStatus = webhookLabels[bot?.webhook_status ?? "not_configured"];
  const shownError = formError || bot?.last_error;
  const canCheckBot = bot?.status === "connected" || bot?.status === "error";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Бот клиники</CardTitle>
        <CardDescription>
          Вставьте токен из BotFather. Сервис проверяет токен, сохраняет его в зашифрованном виде и регистрирует вебхук этой установки.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p role="status">Загрузка бота…</p>}
        {!loading && (bot || !loadError) && (
          <div className="space-y-1 text-sm">
            <p>{status}</p>
            <p>{webhookStatus}</p>
            {bot?.username && bot.public_url && (
              <a href={bot.public_url} className="text-primary underline underline-offset-4">{bot.username}</a>
            )}
          </div>
        )}
        {shownError && <p role="alert" className="text-sm text-destructive">{shownError}</p>}
        {canManage && (
          <form className="space-y-2" onSubmit={connect}>
            <Label htmlFor="clinic-bot-token">Токен бота</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="clinic-bot-token"
                className="min-w-0 flex-1"
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={256}
                disabled={busy}
                value={token}
                onChange={event => setToken(event.target.value)}
              />
              <Button disabled={busy || loading || token.trim().length === 0}>
                {bot?.bot_id == null ? "Подключить" : "Заменить"}
              </Button>
            </div>
          </form>
        )}
        {canManage && canCheckBot && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={() => void updateBot(() => apiRequest<ClinicBot>("/clinic-bot/verify", { method: "POST" }))}
            >
              Проверить
            </Button>
            <Button
              variant="outline"
              disabled={busy || loading}
              onClick={() => void updateBot(() => apiRequest<ClinicBot>("/clinic-bot/disconnect", { method: "POST" }))}
            >
              Отключить
            </Button>
          </div>
        )}
        {loadError && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
            <Button type="button" variant="outline" disabled={busy || loading} onClick={() => void load()}>
              Повторить загрузку
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Подключено — Telegram принял токен. Вебхук активен — Telegram сообщает адрес этого сервера.
        </p>
      </CardContent>
    </Card>
  );
}
