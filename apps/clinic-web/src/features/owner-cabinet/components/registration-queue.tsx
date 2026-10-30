"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { useClientsQuery } from "@/features/patients/hooks";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { ownerError, registrationsApi, type PendingRegistration } from "@/features/owner-cabinet/api";
import { sexLabel, speciesLabel } from "@/features/patients/form";
import { AnimalChat } from "@/features/owner-cabinet/components/animal-chat";

export function RegistrationQueue() {
  const [open, setOpen] = React.useState(false);
  const queue = useQuery({ queryKey: ["owner-registrations"], queryFn: registrationsApi.list, refetchInterval: 30_000 });
  return <div className="border-b p-3">
    <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
      Регистрации{queue.data ? ` · ${queue.data.length}` : ""}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Очередь регистраций</DialogTitle><DialogDescription>Примите владельца и его животных в список пациентов.</DialogDescription></DialogHeader>
        {queue.isPending && <p role="status">Загрузка регистраций…</p>}
        {queue.isError && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{ownerError(queue.error)}</p><Button variant="outline" onClick={() => void queue.refetch()}>Повторить</Button></div>}
        {queue.data?.length === 0 && <p className="text-sm text-muted-foreground">Нет регистраций, ожидающих принятия.</p>}
        <div className="divide-y">{queue.data?.map(row => <RegistrationRow key={row.uuid} row={row} />)}</div>
      </DialogContent>
    </Dialog>
  </div>;
}

function RegistrationRow({ row }: { row: PendingRegistration }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = React.useState<"create" | "link">("create");
  const [query, setQuery] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [matches, setMatches] = React.useState<Record<string, string>>({});
  const debounced = useDebouncedValue(query, 250);
  const clients = useClientsQuery(debounced);
  const patients = useQuery({ queryKey: ["registration-patients", row.uuid, clientId],
    queryFn: () => registrationsApi.patients(row.uuid, clientId), enabled: row.can_accept && mode === "link" && Boolean(clientId) });
  const accept = useMutation({
    mutationFn: () => registrationsApi.accept(row.uuid, { mode, client_uuid: mode === "link" ? clientId : null,
      matches: row.animals.map(animal => ({ owner_animal_id: animal.uuid, patient_uuid: mode === "link" ? matches[animal.uuid] || null : null })) }),
    onSuccess: async () => {
      await Promise.all(["owner-registrations", "visit-requests", "patients", "patient", "clients", "registration-patients"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
  return <form className="space-y-4 py-5 first:pt-0" onSubmit={event => { event.preventDefault(); accept.mutate(); }}>
    <header className="space-y-1 break-words">
      <h3 className="font-semibold">{row.name}</h3>
      <p className="text-sm">{row.email} · {row.phone}</p>
      <p className="text-sm text-muted-foreground">Врач: {row.doctor_name} · {row.organization_name || "Личная практика"}</p>
    </header>
    {row.can_accept && <fieldset disabled={accept.isPending} className="space-y-3">
      <legend className="sr-only">Клиент для регистрации {row.name}</legend>
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2"><input type="radio" name={`mode-${row.uuid}`} checked={mode === "create"} onChange={() => { setMode("create"); setMatches({}); }} />Новый клиент</label>
        <label className="flex items-center gap-2"><input type="radio" name={`mode-${row.uuid}`} checked={mode === "link"} onChange={() => setMode("link")} />Существующий клиент</label>
      </div>
      {mode === "link" && <div className="space-y-2">
        <Input aria-label={`Поиск клиента для ${row.name}`} placeholder="Имя, телефон или email клиента" value={query} onChange={event => { setQuery(event.target.value); setClientId(""); setMatches({}); }} />
        <label className="block space-y-1 text-sm"><span>Клиент</span><select required className="h-10 w-full rounded-md border bg-background px-3" value={clientId} onChange={event => { setClientId(event.target.value); setMatches({}); }}>
          <option value="">Выберите клиента</option>
          {clients.data?.map(client => <option key={client.uuid} value={client.uuid}>{client.name} · {client.phone || client.email}</option>)}
        </select></label>
        {clients.isPending && <p role="status" className="text-sm">Загрузка клиентов…</p>}
        {clients.isError && <p role="alert" className="text-sm text-destructive">{ownerError(clients.error)}</p>}
        {clients.data?.length === 0 && <p className="text-sm text-muted-foreground">Клиенты не найдены.</p>}
        {clientId && patients.isPending && <p role="status" className="text-sm">Загрузка пациентов клиента…</p>}
        {patients.isError && <p role="alert" className="text-sm text-destructive">{ownerError(patients.error)}</p>}
      </div>}
    </fieldset>}
    <ul className="space-y-3">{row.animals.map(animal => <li key={animal.uuid} className="space-y-2 rounded-md border p-3">
      <p className="break-words text-sm font-medium">{animal.name}</p>
      <p className="break-words text-sm text-muted-foreground">{speciesLabel(animal.species)} · {animal.breed || "Порода не указана"} · {sexLabel(animal.sex ?? "unspecified")} · {animal.birth_date ? animal.birth_date.split("-").reverse().join(".") : "Дата рождения не указана"}</p>
      {row.can_accept && mode === "link" && clientId && <label className="block space-y-1 text-sm"><span>Сопоставление для {animal.name}</span><select disabled={accept.isPending || !patients.isSuccess} className="h-10 w-full rounded-md border bg-background px-3" value={matches[animal.uuid] || ""} onChange={event => setMatches(current => ({ ...current, [animal.uuid]: event.target.value }))}>
        <option value="">Отдельный пациент</option>
        {patients.data?.map(patient => <option key={patient.uuid} value={patient.uuid} disabled={Object.entries(matches).some(([id, value]) => id !== animal.uuid && value === patient.uuid)}>{patient.name} · {speciesLabel(patient.species)}</option>)}
      </select></label>}
      <AnimalChat path={`/owner-registrations/${row.uuid}/animals/${animal.uuid}/chat`} canReply={row.can_accept} />
    </li>)}</ul>
    {!row.animals.length && <p className="text-sm text-muted-foreground">Животные ещё не добавлены.</p>}
    {accept.isError && <p role="alert" className="text-sm text-destructive">{ownerError(accept.error)}</p>}
    {row.can_accept ? <Button disabled={accept.isPending || (mode === "link" && (!clientId || !patients.isSuccess))}>{accept.isPending ? "Принятие…" : "Принять регистрацию"}</Button> : <p className="text-sm text-muted-foreground">Доступен только просмотр.</p>}
  </form>;
}
