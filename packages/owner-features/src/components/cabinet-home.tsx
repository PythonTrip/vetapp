"use client";

import * as React from "react";
import { OwnerLink, useOwnerPlatform } from "../platform";
import { ApiError } from "@vetdietderm/api-client";
import { ownerError, ownerRequest, type OwnerProfile } from "../api";
import { Button } from "@vetdietderm/ui/button";
import { Input } from "@vetdietderm/ui/input";
import { Label } from "@vetdietderm/ui/label";
import { TelegramWebLogin } from "./telegram-web-login";
import { ContactFields } from "./contact-fields";
import { DoctorBlock } from "./doctor-block";
import { AnimalList } from "./animal-list";
import { CabinetIcon, type CabinetIconName } from "./cabinet-visuals";
import { ConnectionStatus } from "./connection-status";

const sections = [
  ["home", "Главная"], ["visits", "Консультации"], ["pets", "Питомцы"], ["results", "Результаты"], ["chat", "Сообщения"], ["profile", "Профиль"],
] as const;
export type CabinetSection = typeof sections[number][0];

export function CabinetHome() {
  const platform = useOwnerPlatform();
  const [owner, setOwner] = React.useState<OwnerProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [telegramPassword, setTelegramPassword] = React.useState("");
  const [section, setSection] = React.useState<CabinetSection>("home");
  const autoAttempted = React.useRef(false);
  const loggedOut = React.useRef(false);
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try { setOwner(await ownerRequest<OwnerProfile>("/me")); }
    catch (cause) { if (!(cause instanceof ApiError && cause.status === 401)) setError(ownerError(cause)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    const sync = () => {
      const value = window.location.hash.slice(1) || "home";
      if (sections.some(([key]) => key === value)) setSection(value as CabinetSection);
    };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  React.useEffect(() => {
    if (loading || owner || !platform.telegramAuth || autoAttempted.current || loggedOut.current) return;
    autoAttempted.current = true;
    setBusy(true); setError("");
    platform.telegramAuth.login().then(setOwner).catch(cause => setError(ownerError(cause))).finally(() => setBusy(false));
  }, [loading, owner, platform.telegramAuth]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError(""); setNotice("");
    try {
      setOwner(await ownerRequest<OwnerProfile>(owner ? "/me" : "/login", owner ? "PATCH" : "POST", data));
      if (owner) setNotice("Профиль сохранён");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401 && owner) setOwner(null);
      setError(ownerError(cause));
    } finally { setBusy(false); }
  }
  if (loading || (!owner && busy && platform.telegramAuth)) return <p role="status">Открываем кабинет…</p>;
  return <div data-owner-cabinet className="space-y-6">
    <header className="cabinet-header">
      <div><h1>{owner ? "Привет!" : "Войти в кабинет"}</h1><p>{owner ? "Всё для здоровья ваших питомцев" : "Кабинет владельца животного"}</p></div>
      {owner && <a className="profile-avatar" href="#profile" aria-label="Мой профиль" onClick={() => setSection("profile")}>{owner.name.trim().slice(0, 1).toLocaleUpperCase("ru")}</a>}
    </header>
    <ConnectionStatus />
    {owner && <nav aria-label="Разделы кабинета" className="cabinet-nav">
      {([["home", "Главная", "home"], ["pets", "Питомцы", "paw"], ["chat", "Сообщения", "chat"], ["profile", "Профиль", "profile"]] as const).map(([key, label, icon]) => <a key={key} href={`#${key}`} aria-current={section === key || (key === "home" && (section === "visits" || section === "results")) ? "page" : undefined} onClick={() => setSection(key)}><CabinetIcon name={icon as CabinetIconName} /><span>{label}</span></a>)}
    </nav>}
    {owner && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {owner && notice && <p role="status" className="text-sm">{notice}</p>}
    <div hidden={Boolean(owner && section !== "profile")} className="space-y-6">
    {owner?.doctor_name && <DoctorBlock doctor={owner} />}
    {owner && !owner.doctor_name && <details className="space-y-3 border-b pb-6">
      <summary className="cursor-pointer font-medium">Подключить врача</summary>
      <p className="text-sm text-muted-foreground">Кабинет уже готов. Добавьте питомца, а код врача можно указать позже.</p>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
        setBusy(true); setError("");
        try { setOwner(await ownerRequest<OwnerProfile>("/connect-doctor", "POST", data)); }
        catch (cause) { setError(ownerError(cause)); } finally { setBusy(false); }
      }}>
        <Label htmlFor="doctor-code">Код врача</Label><Input id="doctor-code" name="code" required maxLength={64} disabled={busy} />
        <Button variant="outline" disabled={busy}>Подключить врача</Button>
      </form>
    </details>}
    {platform.telegramAuth && !owner?.telegram_linked && <section className="space-y-4">
      {owner ? <form className="space-y-3" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError(""); setNotice("");
        try { setOwner(await platform.telegramAuth!.link(owner.email, telegramPassword)); setNotice("Telegram привязан. При следующем открытии можно войти через Telegram"); }
        catch (cause) { setError(ownerError(cause)); }
        finally { setTelegramPassword(""); setBusy(false); }
      }}>
        <Label htmlFor="telegram-password">Подтвердите пароль кабинета для привязки Telegram</Label>
        <Input id="telegram-password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} value={telegramPassword} onChange={event => setTelegramPassword(event.target.value)} />
        <Button variant="outline" disabled={busy}>Привязать Telegram</Button>
      </form> : <Button disabled={busy} onClick={async () => {
        setBusy(true); setError(""); setNotice("");
        try { setOwner(await platform.telegramAuth!.login()); }
        catch (cause) { setError(ownerError(cause)); }
        finally { setBusy(false); }
      }}>Войти через Telegram</Button>}
    </section>}
    {!owner && platform.kind === "browser" && <TelegramWebLogin onLogin={setOwner} onError={setError} />}
    {owner && owner.has_password === false && <details className="space-y-4 border-b pb-6">
      <summary className="cursor-pointer font-medium">Добавить вход по почте</summary>
      <p className="text-sm text-muted-foreground">Необязательно. Для входа в этот же кабинет по почте задайте пароль.</p>
      <form className="space-y-3" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
        setBusy(true); setError(""); setNotice("");
        try { setOwner(await ownerRequest<OwnerProfile>("/credentials", "POST", data)); setNotice("Вход по почте настроен"); }
        catch (cause) { setError(ownerError(cause)); } finally { form.reset(); setBusy(false); }
      }}>
        <Label htmlFor="credentials-email">Почта для входа</Label><Input id="credentials-email" name="email" type="email" autoComplete="email" required maxLength={255} disabled={busy} />
        <Label htmlFor="credentials-password">Новый пароль</Label><Input id="credentials-password" name="password" type="password" autoComplete="new-password" required minLength={15} maxLength={128} disabled={busy} />
        <p className="text-sm text-muted-foreground">От 15 до 128 символов.</p>
        <Button disabled={busy}>Сохранить почту и пароль</Button>
      </form>
    </details>}
    <section className="space-y-4">
      {owner && <h2 className="text-lg font-semibold">Мой профиль</h2>}
      <form key={owner?.uuid ?? "login"} onSubmit={submit} className="space-y-4">
        {owner ? <ContactFields values={owner} disabled={busy} requireContacts={owner.has_password !== false} /> : <>
          <div className="space-y-2"><Label htmlFor="owner-email">Электронная почта</Label><Input id="owner-email" name="email" type="email" autoComplete="email" required disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="owner-password">Пароль</Label><Input id="owner-password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></div>
        </>}
        {!owner && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Сохранение…" : owner ? "Сохранить профиль" : "Войти"}</Button>
      </form>
    </section>
    </div>
    {owner && <div hidden={section === "profile"}><AnimalList key={owner.uuid} linked={owner.linked} doctorName={owner.doctor_name} hasDoctor={Boolean(owner.doctor_name)} section={section} onSection={next => { setSection(next); window.location.hash = next; }} /></div>}
    {owner ? <Button className={section === "profile" ? "" : "hidden"} variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await ownerRequest("/logout", "POST"); loggedOut.current = true; setOwner(null); setNotice(""); }
      catch (cause) { setError(ownerError(cause)); }
      finally { setBusy(false); }
    }}>Выйти из кабинета</Button> : <div className="space-y-4"><OwnerLink className="text-sm underline underline-offset-4" href="/join">Присоединиться по коду врача</OwnerLink>{error && <Button variant="outline" onClick={() => void load()}>Проверить сессию ещё раз</Button>}</div>}
  </div>;
}
