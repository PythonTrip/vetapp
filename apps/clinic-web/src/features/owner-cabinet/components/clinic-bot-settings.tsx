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
type JoinCode = components["schemas"]["CurrentJoinCode"];

const statusLabels = { connected: "Подключён", error: "Ошибка" } as const;
const copyFailed = "Не удалось скопировать. Выделите и скопируйте текст вручную.";

function widgetDomain(link: string): string {
  try {
    return new URL(link).host;
  } catch {
    return "";
  }
}

export function ClinicBotSettings() {
  const { user } = useAuth();
  const role = user?.organization?.org_role;
  const canConnect = role === "owner" || role === "admin";
  const [bot, setBot] = React.useState<ClinicBot | null>(null);
  const [link, setLink] = React.useState("");
  const [token, setToken] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [copyError, setCopyError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [botResult, linkResult] = await Promise.allSettled([
      apiRequest<ClinicBot>("/clinic-bot"),
      apiRequest<JoinCode>("/join-codes/current"),
    ]);
    if (botResult.status === "fulfilled") setBot(botResult.value);
    else setLoadError(apiErrorMessage(botResult.reason));
    if (linkResult.status === "fulfilled") setLink(linkResult.value.link);
    else setLoadError(current => current || apiErrorMessage(linkResult.reason));
    setLoading(false);
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function copy(value: string) {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setNotice("Скопировано");
      setCopyError("");
    } catch {
      setNotice("");
      setCopyError(copyFailed);
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    const next = token.trim();
    if (!next) return;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      await apiRequest<ClinicBot>("/clinic-bot", { method: "PUT", body: { token: next } });
      setToken("");
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      try {
        setBot(await apiRequest<ClinicBot>("/clinic-bot"));
      } catch (cause) {
        setLoadError(apiErrorMessage(cause));
      }
      setBusy(false);
    }
  }

  const status = bot?.status ? statusLabels[bot.status] : "Не подключён";
  const domain = link ? widgetDomain(link) : "";
  const shownError = formError || (bot?.status === "error" ? bot.last_error : "") || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Бот клиники</CardTitle>
        <CardDescription>
          Вставьте токен из BotFather. Сервис проверяет токен в Telegram и не меняет настройки BotFather.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p role="status">Загрузка бота…</p>}
        {!loading && (bot || !loadError) && <p className="text-sm">{status}{bot?.username ? ` · ${bot.username}` : ""}</p>}
        {shownError && <p role="alert" className="text-sm text-destructive">{shownError}</p>}
        {canConnect && (
          <form className="space-y-2" onSubmit={event => { void connect(event); }}>
            <Label htmlFor="clinic-bot-token">Токен бота</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="clinic-bot-token"
                className="min-w-0 flex-1"
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={256}
                value={token}
                onChange={event => setToken(event.target.value)}
              />
              <Button disabled={busy || token.trim().length === 0}>Подключить</Button>
            </div>
          </form>
        )}
        {link && (
          <div className="space-y-3">
            <CopyValue label="Ссылка клиники" value={link} onCopy={copy} />
            <CopyValue label="Адрес Mini App" value={link} onCopy={copy} />
            <CopyValue label="Домен виджета входа" value={domain} onCopy={copy} />
          </div>
        )}
        {loadError && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void load()}>Повторить загрузку</Button>
          </div>
        )}
        {copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <p className="text-sm text-muted-foreground">
          Подключено — значит Telegram принял токен. Кнопку Mini App и домен виджета нужно вставить в BotFather отдельно.
        </p>
      </CardContent>
    </Card>
  );
}

function CopyValue({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => Promise<void> }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="break-all select-all text-sm">{value}</p>
      <Button type="button" variant="outline" onClick={() => void onCopy(value)}>Копировать</Button>
    </div>
  );
}
