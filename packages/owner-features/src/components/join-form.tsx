"use client";

import * as React from "react";
import { OwnerLink, useOwnerPlatform } from "../platform";
import { ApiError } from "@vetdietderm/api-client";
import { Button } from "@vetdietderm/ui/button";
import { Input } from "@vetdietderm/ui/input";
import { Label } from "@vetdietderm/ui/label";
import { ContactFields } from "./contact-fields";
import { TelegramWebLogin } from "./telegram-web-login";
import { ownerError, ownerRequest, type DoctorPreview, type OwnerProfile } from "../api";

export function JoinForm({ code }: { code?: string }) {
  const platform = useOwnerPlatform();
  const [clinic, setClinic] = React.useState<DoctorPreview | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(code));
  const [signIn, setSignIn] = React.useState(false);
  const openCabinet = React.useCallback(() => platform.navigate("/cabinet", true), [platform]);
  React.useEffect(() => {
    if (!code) return;
    let active = true;
    async function load(clinicCode: string) {
      try {
        const preview = await ownerRequest<DoctorPreview>(`/join/${encodeURIComponent(clinicCode)}`);
        if (!active) return;
        setClinic(preview);
        const owner = await ownerRequest<OwnerProfile>("/me").catch(cause => {
          if (cause instanceof ApiError && cause.status === 401) return null;
          throw cause;
        });
        if (!active) return;
        if (owner?.clinic_code === clinicCode) {
          openCabinet();
        } else if (platform.telegramAuth) {
          const config = await ownerRequest<{ bot_username: string | null }>(
            `/telegram/config?code=${encodeURIComponent(clinicCode)}`);
          if (active && config.bot_username) {
            await platform.telegramAuth.login(clinicCode);
            if (active) openCabinet();
          }
        }
      } catch (cause) {
        if (active) setError(ownerError(cause));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load(code);
    return () => { active = false; };
  }, [code, openCabinet, platform.telegramAuth]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!code) {
      platform.navigate(`/join/${encodeURIComponent(String(data.code).trim())}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await ownerRequest(signIn ? "/login" : "/register", "POST", { ...data, code });
      openCabinet();
    } catch (cause) {
      setError(ownerError(cause));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="space-y-2">
      <h1 className="text-2xl font-semibold">{clinic ? clinic.organization_name || clinic.doctor_name : "Вход в клинику"}</h1>
      <p className="text-sm text-muted-foreground">Кабинет владельца животного</p>
    </header>
    {loading && <p role="status">Загрузка данных клиники…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {(!code || (clinic && !loading)) && <form key={String(signIn)} onSubmit={submit} className="space-y-4">
      {!code ? <div className="space-y-2">
        <Label htmlFor="join-code">Код клиники</Label>
        <Input id="join-code" name="code" required maxLength={64} autoComplete="off" />
      </div> : <>
        {signIn ? <div className="space-y-2">
          <Label htmlFor="owner-email">Электронная почта</Label>
          <Input id="owner-email" name="email" type="email" autoComplete="email" required disabled={busy} />
        </div> : <ContactFields disabled={busy} />}
        <div className="space-y-2">
          <Label htmlFor="owner-password">Пароль</Label>
          <Input id="owner-password" name="password" type="password" autoComplete={signIn ? "current-password" : "new-password"}
            required minLength={signIn ? 1 : 15} maxLength={128} disabled={busy} />
          {!signIn && <p className="text-sm text-muted-foreground">От 15 до 128 символов.</p>}
        </div>
      </>}
      <Button className="w-full" disabled={busy}>{code ? signIn ? "Войти" : "Создать кабинет" : "Продолжить"}</Button>
      {code && <Button type="button" variant="link" disabled={busy} onClick={() => { setSignIn(!signIn); setError(""); }}>
        {signIn ? "Создать кабинет" : "Уже есть кабинет? Войти"}
      </Button>}
    </form>}
    {code && clinic && !loading && <TelegramWebLogin code={code} onLogin={openCabinet} onError={setError}
      miniAppLogin={platform.telegramAuth?.login} />}
    {code && <OwnerLink className="text-sm underline underline-offset-4" href="/join">Ввести другой код</OwnerLink>}
  </>;
}
