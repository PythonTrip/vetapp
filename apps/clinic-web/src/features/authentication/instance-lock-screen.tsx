"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PawPrint } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { accountRequest } from "@/features/authentication/api";
import { useAuth } from "@/features/authentication/auth-provider";
import { OrganizationSettings } from "@/features/authentication/organization-settings";

export function InstanceLockScreen({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, user, workspace, error: authError, login } = useAuth();
  const [mode, setMode] = React.useState<"login" | "register" | "verify" | "forgot" | "reset">("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [resetToken, setResetToken] = React.useState("");
  const [invite, setInvite] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname === "/reset-password") {
      setResetToken(url.searchParams.get("token") ?? ""); setMode("reset");
    }
    setInvite(url.pathname === "/org-invite");
  }, []);
  function changeMode(next: typeof mode) { setMode(next); setError(null); setNotice(""); setPassword(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setNotice("");
    try {
      if (mode === "login") await login(email, password);
      if (mode === "register") {
        await accountRequest("/auth/register", "POST", { email, password });
        setMode("verify"); setNotice("Введите шестизначный код из письма.");
      }
      if (mode === "verify") {
        await accountRequest("/auth/email/verify", "POST", { email, code });
        setMode("login"); setNotice("Почта подтверждена. Теперь войдите в аккаунт.");
      }
      if (mode === "forgot") {
        await accountRequest("/auth/password/forgot", "POST", { email });
        setNotice("Если аккаунт доступен для восстановления, инструкции отправлены на почту.");
      }
      if (mode === "reset") {
        await accountRequest("/auth/password/reset", "POST", { token: resetToken, new_password: password });
        window.history.replaceState(null, "", "/");
        setMode("login"); setResetToken(""); setNotice("Пароль изменён. Войдите снова.");
      }
      setPassword("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выполнить запрос"); }
    finally { setBusy(false); }
  }
  if (status === "authenticated" && mode !== "reset") {
    if (invite) return <div className="mx-auto max-w-3xl p-4 sm:p-8"><OrganizationSettings onAccepted={() => { setInvite(false); router.replace("/settings"); }} /><Button variant="link" onClick={() => { setInvite(false); router.replace("/patients"); }}>Продолжить без приглашения</Button></div>;
    return <React.Fragment key={`${user?.user_id}:${workspace}:${workspace === "organization" ? user?.organization?.org_id : ""}:${workspace === "organization" ? user?.organization?.org_role : ""}`}>{children}</React.Fragment>;
  }
  const titles = { login: "Войти в VetDietDerm", register: "Создать аккаунт", verify: "Подтвердить почту", forgot: "Восстановить пароль", reset: "Новый пароль" };
  const actions = { login: "Войти", register: "Зарегистрироваться", verify: "Подтвердить", forgot: "Отправить инструкции", reset: "Сохранить пароль" };
  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
    <section className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 sm:p-8">
      <div className="space-y-2"><PawPrint className="h-8 w-8 text-primary" /><h1 className="text-2xl font-semibold">{titles[mode]}</h1><p className="text-sm text-muted-foreground">Личное рабочее место. Организацию можно подключить позже в настройках.</p></div>
      {status === "checking" ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Проверка сессии…</p> : <>
        <form className="space-y-4" onSubmit={submit}>
          {mode !== "reset" && <div className="space-y-2"><Label htmlFor="auth-email">Электронная почта</Label><Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></div>}
          {["login", "register", "reset"].includes(mode) && <div className="space-y-2"><Label htmlFor="auth-password">Пароль</Label><Input id="auth-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 15} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />{mode !== "login" && <p className="text-sm text-muted-foreground">От 15 до 128 символов.</p>}</div>}
          {mode === "verify" && <div className="space-y-2"><Label htmlFor="auth-code">Код из письма</Label><Input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} disabled={busy} /></div>}
          {(error ?? authError) && <p role="alert" className="text-sm text-destructive">{error ?? authError}</p>}
          {notice && <p role="status" className="text-sm">{notice}</p>}
          <Button className="w-full" disabled={busy || (mode === "reset" && !resetToken)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{actions[mode]}</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {mode === "login" ? <><Button variant="link" onClick={() => changeMode("register")}>Создать аккаунт</Button><Button variant="link" onClick={() => changeMode("forgot")}>Забыли пароль?</Button><Button variant="link" onClick={() => changeMode("verify")}>Подтвердить почту</Button></> : <Button variant="link" onClick={() => changeMode("login")}>Вернуться ко входу</Button>}
          {mode === "verify" && <Button variant="link" disabled={busy || !email} onClick={async () => {
            setBusy(true); setError(null);
            try { await accountRequest("/auth/email/resend-verification", "POST", { email }); setNotice("Если подтверждение доступно, новый код отправлен на почту."); }
            catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось отправить код"); }
            finally { setBusy(false); }
          }}>Отправить код повторно</Button>}
        </div>
      </>}
    </section>
  </main>;
}
