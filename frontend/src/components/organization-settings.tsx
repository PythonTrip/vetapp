"use client";

import * as React from "react";
import { accountRequest, useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Member { user_id: string; email: string; display_name: string | null; org_role: string }
interface Invite { invite_id: string; email: string; org_role: string }
const roleNames: Record<string, string> = { owner: "Владелец", admin: "Администратор", member: "Сотрудник", viewer: "Наблюдатель" };
export function OrganizationSettings({ onAccepted }: { onAccepted?: () => void }) {
  const { user, workspace, setWorkspace, reload, logout } = useAuth();
  const org = user?.organization;
  const manager = org?.org_role === "owner" || org?.org_role === "admin" || user?.role === "super_admin";
  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [name, setName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("member");
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const path = `/organizations/${org?.org_id}`;
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (url.pathname === "/org-invite") setToken(url.searchParams.get("token") ?? "");
  }, []);
  React.useEffect(() => { setName(org?.name ?? ""); setDisplayName(user?.display_name ?? ""); }, [org?.name, user?.display_name]);
  const load = React.useCallback(async () => {
    if (!org) return;
    const [team, pending] = await Promise.all([
      accountRequest<{ members: Member[] }>(`${path}/members`),
      manager ? accountRequest<{ invites: Invite[] }>(`${path}/invites`) : Promise.resolve({ invites: [] }),
    ]);
    setMembers(team.members); setInvites(pending.invites);
  }, [org, path, manager]);
  React.useEffect(() => {
    let active = true;
    if (org) {
      setLoading(true);
      void load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Не удалось загрузить команду"); }).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [load, org]);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await reload(); setNotice(message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось выполнить запрос"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-6" aria-label="Аккаунт и организация">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{org?.name ?? "Ваше рабочее место"}</h2><p className="break-all text-sm text-muted-foreground">{user?.email}{org && ` · ${roleNames[org.org_role]}`}</p></div><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await logout(); } catch { setError("Не удалось выйти. Повторите попытку."); } finally { setBusy(false); } }}>Выйти</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <fieldset className="space-y-3 rounded-xl border p-4">
      <legend className="px-1 font-semibold">Рабочее место</legend>
      <label className="flex items-center gap-2"><input type="radio" name="workspace" checked={workspace === "personal"} onChange={() => setWorkspace("personal")} />Личное — доступно только вам</label>
      {org && <label className="flex items-center gap-2"><input type="radio" name="workspace" checked={workspace === "organization"} onChange={() => setWorkspace("organization")} />{org.name} — общие данные команды</label>}
      <p className="text-sm text-muted-foreground">Личные данные сохраняются отдельно и не передаются организации.</p>
    </fieldset>
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(() => accountRequest("/me", "PATCH", { display_name: displayName }), "Имя сохранено"); }}><Label htmlFor="profile-name">Ваше имя</Label><div className="flex flex-wrap gap-2"><Input id="profile-name" className="min-w-0 flex-1" maxLength={120} value={displayName} onChange={e => setDisplayName(e.target.value)} /><Button variant="outline" disabled={busy}>Сохранить имя</Button></div></form>
    {(!org || manager) && <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(() => accountRequest(org ? path : "/organizations", org ? "PATCH" : "POST", { name }), org ? "Название сохранено" : "Организация создана"); }}><Label htmlFor="organization-name">Название организации</Label><div className="flex flex-wrap gap-2"><Input id="organization-name" className="min-w-0 flex-1" required maxLength={200} value={name} onChange={e => setName(e.target.value)} /><Button disabled={busy}>{org ? "Сохранить" : "Создать организацию"}</Button></div>{!org && <p className="text-sm text-muted-foreground">Организация необязательна. Создайте её, когда понадобится совместная работа с командой.</p>}</form>}
    {(!org || token) && <form className="space-y-2 border-t pt-4" onSubmit={e => { e.preventDefault(); void run(async () => { await accountRequest("/invites/accept", "POST", { token }); setToken(""); onAccepted?.(); }, "Приглашение принято"); }}><Label htmlFor="invite-token">Код приглашения из ссылки в письме</Label><Input id="invite-token" required value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /><Button disabled={busy}>Присоединиться</Button>{org && <p className="text-sm text-muted-foreground">Приглашение добавит членство. Текущей останется первая активная организация.</p>}</form>}
    {org && <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Команда</h3>{loading ? <p role="status">Загрузка команды…</p> : members.map(member => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div className="min-w-0"><p className="break-all text-sm font-medium">{member.display_name || member.email}</p><p className="break-all text-sm text-muted-foreground">{member.email} · {roleNames[member.org_role]}</p></div>{manager && member.org_role !== "owner" && member.user_id !== user?.user_id && <div className="flex flex-wrap gap-2"><select aria-label={`Роль ${member.email}`} className="h-9 rounded-md border bg-background px-2 text-sm" value={member.org_role} disabled={busy} onChange={e => { const next = e.target.value; void run(() => accountRequest(`${path}/members/${member.user_id}`, "PATCH", { org_role: next }), "Роль изменена"); }}>{["admin", "member", "viewer"].map(value => <option key={value} value={value}>{roleNames[value]}</option>)}</select><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(`Удалить ${member.email} из организации?`)) void run(() => accountRequest(`${path}/members/${member.user_id}`, "DELETE"), "Участник удалён"); }}>Удалить</Button></div>}</div>)}</div>}
    {org && manager && <div className="space-y-4"><form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => { await accountRequest(`${path}/invites`, "POST", { email, org_role: role }); setEmail(""); }, "Приглашение отправлено на почту"); }}><h3 className="font-semibold">Пригласить сотрудника</h3><p className="text-sm text-muted-foreground">Сотрудник должен зарегистрироваться и подтвердить почту. Наблюдатель может просматривать данные без изменений.</p><Label htmlFor="teammate-email">Почта сотрудника</Label><Input id="teammate-email" required type="email" value={email} onChange={e => setEmail(e.target.value)} /><div className="flex flex-wrap gap-2"><select aria-label="Роль приглашённого" className="h-9 rounded-md border bg-background px-2 text-sm" value={role} onChange={e => setRole(e.target.value)}>{["admin", "member", "viewer"].map(value => <option key={value} value={value}>{roleNames[value]}</option>)}</select><Button disabled={busy}>Отправить приглашение</Button></div></form>{invites.length > 0 && <div className="space-y-2"><h3 className="font-semibold">Ожидают ответа</h3>{invites.map(item => <div key={item.invite_id} className="flex flex-wrap items-center justify-between gap-2"><span className="break-all text-sm">{item.email} · {roleNames[item.org_role]}</span><Button variant="outline" disabled={busy} onClick={() => { void run(() => accountRequest(`${path}/invites/${item.invite_id}`, "DELETE"), "Приглашение отменено"); }}>Отменить</Button></div>)}</div>}</div>}
  </section>;
}
