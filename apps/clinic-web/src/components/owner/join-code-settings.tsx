"use client";

import * as React from "react";
import { apiRequest } from "@/lib/api-client";
import { ownerError } from "@/lib/owner-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function JoinCodeSettings() {
  const [data, setData] = React.useState<{ code: string; link: string } | null>(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiRequest("/join-codes/current")); }
    catch (cause) { setError(ownerError(cause)); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Скопировано"); setError(""); }
    catch { setError("Не удалось скопировать. Выделите и скопируйте текст вручную."); }
  }
  return <Card><CardHeader><CardTitle className="text-base">Приглашение владельца</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Передайте владельцу код или ссылку для создания кабинета у вас в текущем рабочем месте.</p>
    {loading && <p role="status">Загрузка приглашения…</p>}
    {data && <><p className="break-all font-mono text-lg">{data.code}</p><p className="break-all select-all text-sm">{data.link}</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copy(data.code)}>Копировать код</Button><Button variant="outline" onClick={() => void copy(data.link)}>Копировать ссылку</Button></div></>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" disabled={loading} onClick={() => void load()}>Повторить загрузку</Button></div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </CardContent></Card>;
}
