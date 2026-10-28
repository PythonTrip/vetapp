"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, toDateTimeLocal, VISIT_TYPE_LABELS } from "@/lib/clinical-labels";
import { useClientsQuery, useDebouncedValue } from "@/lib/hooks";
import { ownerError, registrationsApi, visitAnswerLabel, visitRequestsApi, type PendingRegistration, type RegistrationAccept, type StaffVisit, type VisitFile } from "@/lib/owner-api";
import { speciesLabel } from "@/lib/patient-form";

const selectClass = "min-h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";

export function VisitRequestQueue() {
  const [open, setOpen] = React.useState(false);
  const queue = useQuery({ queryKey: ["visit-requests"], queryFn: visitRequestsApi.list, refetchInterval: 30_000 });
  const rows = queue.data?.filter(row => row.status === "requested");
  return <div className="shrink-0 border-b p-3">
    <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
      Запросы визитов{rows ? ` · ${rows.length}` : ""}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Запросы визитов</DialogTitle><DialogDescription>Предложенное время, ответы владельца и файлы к визиту.</DialogDescription></DialogHeader>
        {queue.isPending && <p role="status">Загрузка запросов…</p>}
        {queue.isError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{ownerError(queue.error)}</p><Button variant="outline" onClick={() => void queue.refetch()}>Повторить</Button></div>}
        {rows?.length === 0 && <p className="text-sm text-muted-foreground">Нет запросов, ожидающих подтверждения</p>}
        <div className="divide-y">{rows?.map(row => <VisitRow key={row.uuid} row={row} />)}</div>
      </DialogContent>
    </Dialog>
  </div>;
}

function VisitRow({ row }: { row: StaffVisit }) {
  const queryClient = useQueryClient();
  const [action, setAction] = React.useState<"confirm" | "reject" | null>(null);
  const [reason, setReason] = React.useState("");
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState("");
  const changed = async () => {
    setAction(null);
    await Promise.all(["visit-requests", "owner-registrations", "patients", "patient", "clients", "registration-patients", "appointments"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
  };
  const reject = useMutation({ mutationFn: () => visitRequestsApi.reject(row.uuid, reason), onSuccess: changed });
  async function download(file: VisitFile) {
    if (downloading) return;
    setDownloading(true); setDownloadError("");
    try {
      const blob = await visitRequestsApi.download(row.uuid, file.uuid);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = `файл.${file.content_type === "application/pdf" ? "pdf" : file.content_type.split("/")[1]}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) { setDownloadError(ownerError(cause)); }
    finally { setDownloading(false); }
  }
  return <article className="min-w-0 space-y-3 py-5 first:pt-0">
    <header className="break-words">
      <h3 className="font-semibold">{row.animal_name} · {row.owner_name}</h3>
      <p className="text-sm">{VISIT_TYPE_LABELS[row.visit_type]}</p>
      <p className="text-sm">Предложено: {formatDateTime(row.proposed_starts_at)}</p>
    </header>
    <dl className="space-y-2 text-sm">{row.answers.map(answer => <div key={answer.question_id} className="break-words">
      <dt className="font-medium">{answer.label}</dt><dd className="whitespace-pre-wrap">{visitAnswerLabel(answer)}</dd>
    </div>)}</dl>
    {row.files.map((file, index) => <Button key={file.uuid} type="button" variant="outline" className="h-auto w-full whitespace-normal" disabled={downloading} onClick={() => void download(file)}>Скачать файл {index + 1} · {file.content_type === "application/pdf" ? "PDF" : "Фото"}</Button>)}
    {downloadError && <p role="alert" className="break-words text-sm text-destructive">{downloadError}</p>}
    {row.can_write ? <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => setAction("confirm")}>Подтвердить</Button>
      <Button type="button" variant="outline" onClick={() => { reject.reset(); setReason(""); setAction("reject"); }}>Отклонить</Button>
    </div> : <p className="text-sm text-muted-foreground">Доступен только просмотр.</p>}
    <Dialog open={action !== null} onOpenChange={open => { if (!open && !reject.isPending) setAction(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{action === "confirm" ? "Подтверждение визита" : "Отклонение визита"}</DialogTitle><DialogDescription>{row.animal_name} · {row.owner_name}</DialogDescription></DialogHeader>
        {action === "confirm" && row.can_write && <ConfirmVisit row={row} onSuccess={changed} />}
        {action === "reject" && row.can_write && <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!reject.isPending) reject.mutate(); }}>
          <label className="block space-y-1 text-sm"><span>Причина отказа (необязательно)</span><Textarea maxLength={500} disabled={reject.isPending} value={reason} onChange={event => setReason(event.target.value)} /></label>
          {reject.isError && <p role="alert" className="break-words text-sm text-destructive">{ownerError(reject.error)}</p>}
          <Button type="submit" disabled={reject.isPending}>{reject.isPending ? "Отклонение…" : "Отклонить визит"}</Button>
        </form>}
      </DialogContent>
    </Dialog>
  </article>;
}

function ConfirmVisit({ row, onSuccess }: { row: StaffVisit; onSuccess: () => Promise<void> }) {
  const [startsAt, setStartsAt] = React.useState(() => toDateTimeLocal(row.proposed_starts_at));
  const [duration, setDuration] = React.useState(30);
  const needsRegistration = row.registration_status === "pending";
  const registrations = useQuery({ queryKey: ["owner-registrations"], queryFn: registrationsApi.list, enabled: needsRegistration });
  const registration = registrations.data?.find(item => item.uuid === row.registration_uuid);
  const [acceptance, setAcceptance] = React.useState<RegistrationAccept | null>(null);
  const confirm = useMutation({
    mutationFn: () => visitRequestsApi.confirm(row.uuid, {
      starts_at: new Date(startsAt).toISOString(), duration_min: duration,
      ...(needsRegistration && acceptance ? { registration: acceptance } : {}),
    }),
    onSuccess,
  });
  const ready = Boolean(startsAt) && duration >= 5 && duration <= 480 && Number.isInteger(duration) && (!needsRegistration || Boolean(registration?.can_accept && acceptance));
  return <form className="min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); if (ready && !confirm.isPending) confirm.mutate(); }}>
    <fieldset disabled={confirm.isPending} className="min-w-0 space-y-3">
      <label className="block min-w-0 space-y-1 text-sm"><span>Дата и время визита</span><Input className="min-w-0 max-w-full" type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
      <label className="block space-y-1 text-sm"><span>Длительность, мин</span><Input type="number" required min={5} max={480} step={1} value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
      {needsRegistration && <>
        {registrations.isPending && <p role="status">Загрузка регистрации…</p>}
        {registrations.isError && <div><p role="alert" className="text-sm text-destructive">{ownerError(registrations.error)}</p><Button type="button" variant="outline" onClick={() => void registrations.refetch()}>Повторить</Button></div>}
        {registration?.can_accept && <RegistrationChoice key={registration.uuid} row={registration} onChange={setAcceptance} />}
        {registrations.isSuccess && !registration && <p role="alert" className="text-sm text-destructive">Регистрация изменилась. Закройте окно и обновите запросы.</p>}
        {registration && !registration.can_accept && <p role="alert" className="text-sm text-destructive">Нет прав на принятие регистрации.</p>}
      </>}
    </fieldset>
    {confirm.isError && <p role="alert" className="break-words text-sm text-destructive">{ownerError(confirm.error)}</p>}
    <Button type="submit" disabled={confirm.isPending || !ready}>{confirm.isPending ? "Подтверждение…" : "Подтвердить визит"}</Button>
  </form>;
}

function RegistrationChoice({ row, onChange }: { row: PendingRegistration; onChange: (value: RegistrationAccept | null) => void }) {
  const [mode, setMode] = React.useState<"create" | "link">("create");
  const [query, setQuery] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [matches, setMatches] = React.useState<Record<string, string>>({});
  const debounced = useDebouncedValue(query, 250);
  const clients = useClientsQuery(debounced);
  const patients = useQuery({ queryKey: ["registration-patients", row.uuid, clientId], queryFn: () => registrationsApi.patients(row.uuid, clientId), enabled: mode === "link" && Boolean(clientId) });
  React.useEffect(() => {
    const ready = mode === "create" || Boolean(clientId && patients.isSuccess);
    onChange(ready ? { mode, client_uuid: mode === "link" ? clientId : null, matches: row.animals.map(animal => ({ owner_animal_id: animal.uuid, patient_uuid: mode === "link" ? matches[animal.uuid] || null : null })) } : null);
  }, [mode, clientId, matches, row.animals, patients.isSuccess, onChange]);
  return <div className="min-w-0 space-y-3">
    <p className="text-sm">Подтверждение также примет регистрацию владельца и всех его животных.</p>
    <div className="flex flex-wrap gap-3 text-sm">
      <label className="flex items-center gap-2"><input type="radio" name={`visit-mode-${row.uuid}`} checked={mode === "create"} onChange={() => { onChange(null); setMode("create"); setMatches({}); }} />Новый клиент</label>
      <label className="flex items-center gap-2"><input type="radio" name={`visit-mode-${row.uuid}`} checked={mode === "link"} onChange={() => { onChange(null); setMode("link"); }} />Существующий клиент</label>
    </div>
    {mode === "link" && <div className="space-y-2">
      <Input aria-label={`Поиск клиента для ${row.name}`} placeholder="Имя, телефон или email клиента" value={query} onChange={event => { onChange(null); setQuery(event.target.value); setClientId(""); setMatches({}); }} />
      <label className="block space-y-1 text-sm"><span>Клиент</span><select required className={selectClass} value={clientId} onChange={event => { onChange(null); setClientId(event.target.value); setMatches({}); }}>
        <option value="">Выберите клиента</option>
        {clients.data?.map(client => <option key={client.uuid} value={client.uuid}>{client.name} · {client.phone || client.email}</option>)}
      </select></label>
      {clients.isPending && <p role="status" className="text-sm">Загрузка клиентов…</p>}
      {clients.isError && <p role="alert" className="text-sm text-destructive">{ownerError(clients.error)}</p>}
      {clients.data?.length === 0 && <p className="text-sm text-muted-foreground">Клиенты не найдены.</p>}
      {clientId && patients.isPending && <p role="status" className="text-sm">Загрузка пациентов клиента…</p>}
      {patients.isError && <p role="alert" className="text-sm text-destructive">{ownerError(patients.error)}</p>}
    </div>}
    <ul className="space-y-2">{row.animals.map(animal => <li key={animal.uuid} className="rounded-md border p-3 text-sm">
      <p className="break-words font-medium">{animal.name} · {speciesLabel(animal.species)}</p>
      {mode === "link" && clientId && <label className="block space-y-1"><span>Сопоставление для {animal.name}</span><select className={selectClass} disabled={!patients.isSuccess} value={matches[animal.uuid] || ""} onChange={event => setMatches(current => ({ ...current, [animal.uuid]: event.target.value }))}>
        <option value="">Отдельный пациент</option>
        {patients.data?.map(patient => <option key={patient.uuid} value={patient.uuid} disabled={Object.entries(matches).some(([id, value]) => id !== animal.uuid && value === patient.uuid)}>{patient.name} · {speciesLabel(patient.species)}</option>)}
      </select></label>}
    </li>)}</ul>
  </div>;
}
