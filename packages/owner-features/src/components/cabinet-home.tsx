"use client";

import * as React from "react";
import { OwnerLink } from "../platform";
import { ApiError } from "@vetdietderm/api-client";
import { ownerError, ownerRequest, type OwnerProfile } from "../api";
import { Button } from "@vetdietderm/ui/button";
import { Input } from "@vetdietderm/ui/input";
import { Label } from "@vetdietderm/ui/label";
import { ContactFields } from "./contact-fields";
import { DoctorBlock } from "./doctor-block";
import { AnimalList } from "./animal-list";

export function CabinetHome() {
  const [owner, setOwner] = React.useState<OwnerProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try { setOwner(await ownerRequest<OwnerProfile>("/me")); }
    catch (cause) { if (!(cause instanceof ApiError && cause.status === 401)) setError(ownerError(cause)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
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
  if (loading) return <p role="status">Загрузка кабинета…</p>;
  return <>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">{owner ? "Мой кабинет" : "Войти в кабинет"}</h1><p className="text-sm text-muted-foreground">Кабинет владельца животного</p></header>
    {owner && <DoctorBlock doctor={owner} />}
    {owner && <AnimalList key={owner.uuid} linked={owner.linked} />}
    <section className="space-y-4">
      {owner && <h2 className="text-lg font-semibold">Мой профиль</h2>}
      <form key={owner?.uuid ?? "login"} onSubmit={submit} className="space-y-4">
        {owner ? <ContactFields values={owner} disabled={busy} /> : <>
          <div className="space-y-2"><Label htmlFor="owner-email">Электронная почта</Label><Input id="owner-email" name="email" type="email" autoComplete="email" required disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor="owner-password">Пароль</Label><Input id="owner-password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy} /></div>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Сохранение…" : owner ? "Сохранить профиль" : "Войти"}</Button>
      </form>
    </section>
    {owner ? <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await ownerRequest("/logout", "POST"); setOwner(null); setNotice(""); }
      catch (cause) { setError(ownerError(cause)); }
      finally { setBusy(false); }
    }}>Выйти из кабинета</Button> : <div className="space-y-4"><OwnerLink className="text-sm underline underline-offset-4" href="/join">Присоединиться по коду врача</OwnerLink>{error && <Button variant="outline" onClick={() => void load()}>Проверить сессию ещё раз</Button>}</div>}
  </>;
}
