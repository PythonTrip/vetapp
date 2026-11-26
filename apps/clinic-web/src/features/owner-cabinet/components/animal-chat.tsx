"use client";

import * as React from "react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { staffChatApi, type ChatMessage } from "../api";

function chatError(cause: unknown): string {
  if (cause instanceof Error && /Failed to fetch|NetworkError|API unavailable|fetch failed|Load failed/i.test(cause.message)) {
    return "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.";
  }
  return cause instanceof Error ? cause.message : "Не удалось выполнить запрос";
}

export function AnimalChat({
  path,
  canReply = true,
  animalName,
  doctorName,
}: {
  path: string;
  ownerView?: boolean;
  canReply?: boolean;
  animalName?: string;
  doctorName?: string;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState("");
  const titleId = React.useId();
  const fieldId = React.useId();
  const generation = React.useRef(0);
  const feed = React.useRef<HTMLOListElement>(null);

  const load = React.useCallback(async (background = false) => {
    const current = ++generation.current;
    if (!background) {
      setLoading(true);
      setError("");
    }
    try {
      const result = await staffChatApi.list(path);
      if (current === generation.current) setMessages(result);
    } catch (cause) {
      if (current === generation.current) setError(chatError(cause));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [path]);

  React.useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void load(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  React.useEffect(() => {
    const element = feed.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (sending || loading || !canReply || !body.trim() || body.trim().length > 4000) return;
    setSending(true);
    setError("");
    try {
      await staffChatApi.send(path, false, body.trim());
      setBody("");
      await load(true);
    } catch (cause) {
      setError(chatError(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-3 rounded-md border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id={titleId} title={doctorName} className="font-semibold">{doctorName || "Переписка"}</h4>
          {animalName && <p>Ветеринар · {animalName}</p>}
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={loading || sending} onClick={() => void load()}>
          Обновить
        </Button>
      </div>
      {loading && <p role="status" className="text-sm">Загрузка сообщений…</p>}
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <ol ref={feed} aria-label="Сообщения" className="max-h-96 space-y-3 overflow-y-auto text-sm">
        {!loading && !error && messages.length === 0 && (
          <li className="text-sm text-muted-foreground">Сообщений пока нет.</li>
        )}
        {messages.map(message => (
          <li
            key={message.uuid}
            className={`min-w-0 rounded-md p-3 ${message.author_kind === "staff" ? "bg-muted" : "border"}`}
          >
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{message.author_label}</span>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
            {message.attachments?.map(file => (
              <button
                type="button"
                className="mt-2 block text-left text-sm underline"
                key={file.uuid}
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  setError("");
                  try {
                    const blob = await staffChatApi.download(path, file.uuid);
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = file.filename;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  } catch (cause) {
                    setError(chatError(cause));
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                {file.filename}
              </button>
            ))}
            <time dateTime={message.created_at}>
              {new Date(message.created_at).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </li>
        ))}
      </ol>
      {canReply ? (
        <form
          className="space-y-2"
          onSubmit={event => {
            event.preventDefault();
            void send();
          }}
        >
          <label htmlFor={fieldId} className="text-sm font-medium">Сообщение</label>
          <Textarea
            id={fieldId}
            value={body}
            maxLength={4000}
            disabled={sending}
            placeholder="Сообщение владельцу…"
            rows={3}
            className="min-h-24 w-full"
            onChange={event => setBody(event.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{body.length} / 4000</span>
            <Button type="submit" disabled={loading || sending || !body.trim()}>
              {sending ? "Отправка…" : "Отправить"}
            </Button>
          </div>
          {sending && <p role="status" className="text-sm">Отправка сообщения…</p>}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Переписка доступна только для чтения.</p>
      )}
    </section>
  );
}
