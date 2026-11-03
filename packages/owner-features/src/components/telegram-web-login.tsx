"use client";

import * as React from "react";
import { Button } from "@vetdietderm/ui/button";
import { ownerRequest, type OwnerProfile } from "../api";

type WidgetUser = { id: number; first_name: string; auth_date: number; hash: string; last_name?: string; username?: string; photo_url?: string };

/** Telegram's signed login widget. Only the server verifies the returned identity. */
export function TelegramWebLogin({ code, onLogin, onError, miniAppLogin }: {
  code: string;
  miniAppLogin?: (code: string) => Promise<OwnerProfile>;
  onLogin: (owner: OwnerProfile) => void;
  onError: (message: string) => void;
}) {
  const container = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  React.useEffect(() => {
    let active = true;
    let pending = false;
    const name = `vetappTelegramLogin${id}`;
    const host = container.current;
    const callbacks = window as unknown as Record<string, unknown>;
    callbacks[name] = async (user: WidgetUser) => {
      if (!active || pending) return;
      pending = true; setStatus("Входим в кабинет…");
      try {
        const owner = await ownerRequest<OwnerProfile>("/telegram/widget", "POST", { ...user, code });
        if (active) onLogin(owner);
      } catch (cause) { if (active) onError(cause instanceof Error ? cause.message : "Не удалось войти через Telegram"); }
      finally { pending = false; if (active) setStatus(""); }
    };
    ownerRequest<{ bot_username: string | null }>(`/telegram/config?code=${encodeURIComponent(code)}`).then(config => {
      if (!active || !host || !config.bot_username) return;
      setAvailable(true);
      if (miniAppLogin) return;
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      script.setAttribute("data-telegram-login", config.bot_username);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-userpic", "false");
      script.setAttribute("data-lang", "ru");
      script.setAttribute("data-onauth", `${name}(user)`);
      script.onerror = () => { if (active) setStatus("Не удалось загрузить вход через Telegram. Обновите страницу или войдите по почте."); };
      host.append(script);
    }).catch(() => { /* Email login stays available when widget config is unavailable. */ });
    return () => { active = false; delete callbacks[name]; host?.replaceChildren(); };
  }, [code, id, miniAppLogin, onLogin, onError]);
  return <section hidden={!available} aria-label="Вход через Telegram" className="space-y-3">
    <div ref={container} />
    {miniAppLogin && <Button variant="outline" disabled={Boolean(status)} onClick={async () => {
      setStatus("Входим в кабинет…");
      try { onLogin(await miniAppLogin(code)); }
      catch (cause) { onError(cause instanceof Error ? cause.message : "Не удалось войти через Telegram"); }
      finally { setStatus(""); }
    }}>Войти через Telegram</Button>}
    {status && <p role="status" className="text-sm">{status}</p>}
  </section>;
}
