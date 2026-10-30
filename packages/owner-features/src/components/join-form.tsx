"use client";

import * as React from "react";
import { OwnerLink, useOwnerPlatform } from "../platform";
import { Button } from "@vetdietderm/ui/button";
import { Input } from "@vetdietderm/ui/input";
import { Label } from "@vetdietderm/ui/label";
import { ContactFields } from "./contact-fields";
import { DoctorBlock } from "./doctor-block";
import { ownerError, ownerRequest, type DoctorPreview } from "../api";

export function JoinForm({ code }: { code?: string }) {
  const platform = useOwnerPlatform();
  const [doctor, setDoctor] = React.useState<DoctorPreview | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(code));
  React.useEffect(() => {
    if (!code) return;
    let active = true;
    ownerRequest<DoctorPreview>(`/join/${encodeURIComponent(code)}`).then(value => { if (active) setDoctor(value); })
      .catch(cause => { if (active) setError(ownerError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!code) { platform.navigate(`/join/${encodeURIComponent(String(data.get("code")).trim())}`); return; }
    setBusy(true); setError("");
    try {
      await ownerRequest("/register", "POST", { code, ...Object.fromEntries(data) });
      platform.navigate("/cabinet", true);
    } catch (cause) { setError(ownerError(cause)); }
    finally { setBusy(false); }
  }
  return <>
    <header className="space-y-2"><h1 className="text-2xl font-semibold">Присоединиться к врачу</h1><p className="text-sm text-muted-foreground">Кабинет владельца животного</p></header>
    {loading && <p role="status">Загрузка данных врача…</p>}
    {doctor && <DoctorBlock doctor={doctor} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {(!code || doctor) && <form onSubmit={submit} className="space-y-4">
      {code ? <><ContactFields disabled={busy} /><div className="space-y-2"><Label htmlFor="owner-password">Пароль</Label><Input id="owner-password" name="password" type="password" autoComplete="new-password" required minLength={15} maxLength={128} disabled={busy} /><p className="text-sm text-muted-foreground">От 15 до 128 символов. Почта и пароль понадобятся для входа.</p></div></> : <div className="space-y-2"><Label htmlFor="join-code">Код врача</Label><Input id="join-code" name="code" required maxLength={64} autoComplete="off" /></div>}
      <Button className="w-full" disabled={busy}>{busy ? "Создание кабинета…" : code ? "Создать кабинет" : "Продолжить"}</Button>
    </form>}
    <div className="flex flex-wrap gap-4 text-sm"><OwnerLink className="underline underline-offset-4" href="/cabinet">Уже есть кабинет? Войти</OwnerLink>{code && <OwnerLink className="underline underline-offset-4" href="/join">Ввести другой код</OwnerLink>}</div>
  </>;
}
