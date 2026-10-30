"use client";

import * as React from "react";
import { Button } from "@vetdietderm/ui/button";
import { Textarea } from "@vetdietderm/ui/textarea";
import { chatApi, ownerError, type ChatMessage } from "../api";

export function AnimalChat({ path, ownerView = true, canReply = true, transport = chatApi }: { path: string; ownerView?: boolean; canReply?: boolean; transport?: typeof chatApi }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [body, setBody] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState("");
  const titleId = React.useId();
  const fieldId = React.useId();
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const result = await transport.list(path, ownerView);
      if (current === generation.current) setMessages(result);
    } catch (cause) { if (current === generation.current) setError(ownerError(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [path, ownerView, transport]);
  React.useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  async function send() {
    if (sending || loading || !canReply || !body.trim() || body.trim().length > 4000) return;
    setSending(true); setError("");
    try {
      await transport.send(path, ownerView, body.trim());
      setBody("");
      await load();
    } catch (cause) { setError(ownerError(cause)); }
    finally { setSending(false); }
  }
  return <section aria-labelledby={titleId} className="min-w-0 space-y-3 rounded-md border bg-background p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 id={titleId} className="font-semibold">Переписка</h4>
      <Button type="button" size="sm" variant="outline" disabled={loading || sending} onClick={() => void load()}>Обновить</Button>
    </div>
    {loading && <p role="status" className="text-sm">Загрузка сообщений…</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    {!loading && !error && messages.length === 0 && <p className="text-sm text-muted-foreground">Сообщений пока нет</p>}
    <ol aria-label="Сообщения" className="max-h-96 space-y-3 overflow-y-auto text-sm">
      {messages.map(message => <li key={message.uuid} className={`min-w-0 rounded-md p-3 ${message.author_kind === (ownerView ? "owner" : "staff") ? "bg-muted" : "border"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{ownerView && message.author_kind === "owner" ? "Вы" : message.author_label}</span>
          <time dateTime={message.created_at} className="text-xs text-muted-foreground">{new Date(message.created_at).toLocaleString("ru-RU")}</time>
        </div>
        <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
      </li>)}
    </ol>
    {canReply ? <div className="space-y-2">
      <label htmlFor={fieldId} className="text-sm font-medium">Сообщение</label>
      <Textarea id={fieldId} value={body} maxLength={4000} disabled={sending} className="min-h-24 w-full" onChange={event => setBody(event.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{body.length} / 4000</span>
        <Button type="button" disabled={loading || sending || !body.trim()} onClick={() => void send()}>{sending ? "Отправка…" : "Отправить"}</Button>
      </div>
    </div> : <p className="text-sm text-muted-foreground">Переписка доступна только для чтения.</p>}
  </section>;
}
