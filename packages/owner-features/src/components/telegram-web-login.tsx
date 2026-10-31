"use client";

import * as React from "react";
import { ownerRequest, type OwnerProfile } from "../api";

type WidgetUser = { id: number; first_name: string; auth_date: number; hash: string; last_name?: string; username?: string; photo_url?: string };

/** Telegram's signed login widget. Only the server verifies the returned identity. */
export function TelegramWebLogin({ onLogin, onError }: {
  onLogin: (owner: OwnerProfile) => void;
  onError: (message: string) => void;
}) {
  const container = React.useRef<HTMLDivElement>(null);
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
        const owner = await ownerRequest<OwnerProfile>("/telegram/widget", "POST", user);
        if (active) onLogin(owner);
      } catch (cause) { if (active) onError(cause instanceof Error ? cause.message : "Не удалось войти через Telegram"); }
      finally { pending = false; if (active) setStatus(""); }
    };
    ownerRequest<{ bot_username: string | null }>("/telegram/config").then(config => {
      if (!active || !host || !config.bot_username) return;
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
  }, [id, onLogin, onError]);
  return <section aria-label="Вход через Telegram" className="space-y-3">
    <div ref={container} />
    {status && <p role="status" className="text-sm">{status}</p>}
  </section>;
}
