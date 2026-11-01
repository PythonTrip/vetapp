"use client";
import * as React from "react";
import { Button } from "@vetdietderm/ui/button";
import { Textarea } from "@vetdietderm/ui/textarea";
import { chatApi, ownerError, ownerUploads, validateOwnerFile, OWNER_UPLOAD_TYPES, type ChatMessage, type ChatTransport } from "../api";
import { CabinetIcon } from "./cabinet-visuals";
import { useOwnerPlatform } from "../platform";

export function AnimalChat({ path, ownerView = true, canReply = true, transport = chatApi, animalId, animalName, doctorName }: { path: string; ownerView?: boolean; canReply?: boolean; transport?: ChatTransport; animalId?: string; animalName?: string; doctorName?: string }) {
  const platform = useOwnerPlatform();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState<{ file: File; uuid?: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState("");
  const titleId = React.useId();
  const fieldId = React.useId();
  const fileId = React.useId();
  const generation = React.useRef(0);
  const feed = React.useRef<HTMLOListElement>(null);
  const feedNotice = ownerView ? error : "";
  const load = React.useCallback(async (background = false) => {
    const current = ++generation.current;
    if (!background) { setLoading(true); setError(""); }
    try { const result = await transport.list(path, ownerView); if (current === generation.current) setMessages(result); }
    catch (cause) { if (current === generation.current) setError(ownerError(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }, [path, ownerView, transport]);
  React.useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  React.useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) void load(true); }, 30_000); return () => window.clearInterval(timer); }, [load]);
  React.useEffect(() => { const element = feed.current; if (element) element.scrollTop = element.scrollHeight; }, [messages.length, feedNotice]);
  async function send() {
    if (sending || loading || !canReply || (!body.trim() && !pending.length) || body.trim().length > 4000) return;
    setSending(true); setError("");
    try {
      const ids: string[] = [];
      for (const item of pending) {
        let id = item.uuid;
        if (!id) {
          if (!animalId || !ownerView) throw new Error("Не удалось определить питомца для вложения");
          id = (await ownerUploads.upload(animalId, item.file, "chat")).uuid;
          setPending(current => current.map(value => value === item ? { ...value, uuid: id } : value));
        }
        ids.push(id);
      }
      await transport.send(path, ownerView, body.trim() || "Вложение", ids.length ? ids : undefined);
      setBody(""); setPending([]); await load(true);
    } catch (cause) { setError(ownerError(cause)); } finally { setSending(false); }
  }
  return <section aria-labelledby={titleId} className={ownerView ? "owner-chat" : "min-w-0 space-y-3 rounded-md border bg-background p-3 sm:p-4"}>
    <div className={ownerView ? "owner-chat-contact" : "flex flex-wrap items-center justify-between gap-2"}>
      {ownerView && <span className="owner-chat-avatar"><CabinetIcon name="profile" size={24} /></span>}
      <div><h4 id={titleId} title={doctorName} className="font-semibold">{doctorName || "Переписка"}</h4>{animalName && <p>Ветеринар{!ownerView && ` · ${animalName}`}</p>}</div>
      {!ownerView && <Button type="button" size="sm" variant="ghost" disabled={loading || sending} onClick={() => void load()}>Обновить</Button>}
    </div>
    {loading && <p role="status" className="text-sm">Загрузка сообщений…</p>}
    {error && !ownerView && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <ol ref={feed} aria-label="Сообщения" className={ownerView ? "owner-chat-feed" : "max-h-96 space-y-3 overflow-y-auto text-sm"}>
      {!loading && !error && messages.length === 0 && <li className="owner-chat-empty"><span><CabinetIcon name="chat" size={48} /></span><h3>Начните диалог с врачом</h3><p>Сообщений пока нет</p><p>Здесь будет храниться история ваших сообщений о здоровье питомца.</p></li>}
      {messages.map(message => <li key={message.uuid} className={ownerView ? `owner-chat-message ${message.author_kind === "owner" ? "is-own" : ""}` : `min-w-0 rounded-md p-3 ${message.author_kind === "staff" ? "bg-muted" : "border"}`}>
        <div className="owner-chat-bubble">{!ownerView && <span className="owner-chat-author">{message.author_label}</span>}<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
          {message.attachments?.map(file => <button type="button" className="owner-chat-file" key={file.uuid} disabled={downloading || !transport.download} onClick={async () => {
            if (!transport.download) return; setDownloading(true); setError("");
            try { await platform.saveFile(await transport.download(path, file.uuid), file.filename); } catch (cause) { setError(ownerError(cause)); } finally { setDownloading(false); }
          }}><CabinetIcon name={file.content_type.startsWith("image/") ? "attach" : "file"} size={18} /><span>{file.filename}<small>{Math.max(1, Math.round(file.byte_size / 1024))} КБ · Скачать</small></span></button>)}
          {ownerView && <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString("ru-RU")}>{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time>}
        </div>
        {!ownerView && <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>}
      </li>)}
      {error && ownerView && <li className="owner-chat-error"><p role="alert" className="break-words text-sm text-destructive">{error}</p><Button type="button" size="sm" variant="ghost" disabled={loading || sending} onClick={() => void load()}>Повторить загрузку</Button></li>}
    </ol>
    {canReply ? <form className={ownerView ? "owner-chat-composer" : "space-y-2"} onSubmit={event => { event.preventDefault(); void send(); }}>
      {pending.length > 0 && <ul className="owner-chat-pending">{pending.map((item, index) => <li key={index}><CabinetIcon name="attach" size={16} /><span>{item.file.name}</span><button type="button" aria-label={`Убрать ${item.file.name}`} disabled={sending} onClick={() => setPending(current => current.filter(value => value !== item))}><CabinetIcon name="close" size={18} /></button></li>)}</ul>}
      <label htmlFor={fieldId} className={ownerView ? "sr-only" : "text-sm font-medium"}>Сообщение</label>
      <div className="owner-chat-compose-row">
        {ownerView && animalId && <><button type="button" className="owner-icon-button owner-chat-attach" aria-label="Добавить вложение" disabled={sending} onClick={() => document.getElementById(fileId)?.click()}><CabinetIcon name="attach" /></button><input id={fileId} aria-label="Прикрепить файл" hidden type="file" multiple disabled={sending} accept={OWNER_UPLOAD_TYPES.join(",")} onChange={event => {
          const selected = Array.from(event.target.files ?? []); event.target.value = "";
          const invalid = selected.map(file => validateOwnerFile(file)).find(Boolean);
          if (invalid || pending.length + selected.length > 10) { setError(invalid || "К сообщению можно прикрепить до 10 файлов."); return; }
          setPending(current => [...current, ...selected.map(file => ({ file }))]); setError("");
        }} /></>}
        <Textarea id={fieldId} value={body} maxLength={4000} disabled={sending} placeholder="Сообщение врачу…" rows={1} className={ownerView ? "owner-chat-input" : "min-h-24 w-full"} onChange={event => setBody(event.target.value)} />
        <Button type="submit" className={ownerView ? "owner-chat-send" : ""} aria-label={sending ? "Отправка…" : "Отправить"} disabled={loading || sending || (!body.trim() && !pending.length)}>{ownerView ? <CabinetIcon name="send" size={21} /> : sending ? "Отправка…" : "Отправить"}</Button>
      </div>
      {!ownerView && <span className="text-xs text-muted-foreground">{body.length} / 4000</span>}
      {sending && <p role="status" className={ownerView ? "sr-only" : "text-sm"}>Отправка сообщения и вложений…</p>}
    </form> : <p className="text-sm text-muted-foreground">Переписка доступна только для чтения.</p>}
  </section>;
}
