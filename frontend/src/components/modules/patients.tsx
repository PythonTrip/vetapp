"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientContactFields, PatientFormFields } from "@/components/patients/form-fields";
import {
  useClientsQuery,
  useCreateClient,
  useCreatePatient,
  useDebouncedValue,
  usePatientsQuery,
} from "@/lib/hooks";
import {
  apiErrorMessage,
  clientFormToPayload,
  emptyClientForm,
  emptyPatientForm,
  formToPatientPayload,
  formatWeightKg,
  speciesLabel,
  type ClientFormValues,
  type PatientFormValues,
} from "@/lib/patient-form";
import type { ClientRecord } from "@/lib/api-client";

export function PatientsModule() {
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const patients = usePatientsQuery(debouncedQuery);
  const [clientOpen, setClientOpen] = React.useState(false);
  const [patientOpen, setPatientOpen] = React.useState(false);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Users className="h-3.5 w-3.5" />
            Реестр
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Пациенты</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Клиенты и животные. Откройте карточку для приёмов, галереи и журнала коммуникаций.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setClientOpen(true)}>
            <Plus className="h-4 w-4" />
            Создать клиента
          </Button>
          <Button type="button" onClick={() => setPatientOpen(true)}>
            <Plus className="h-4 w-4" />
            Создать пациента
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по кличке или имени клиента"
          className="pl-9"
          aria-label="Поиск пациентов"
        />
      </div>

      {patients.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : patients.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {apiErrorMessage(patients.error)}
        </p>
      ) : !patients.data?.length ? (
        <div className="rounded-2xl border border-dashed bg-card px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {debouncedQuery.trim()
              ? `Ничего не найдено по запросу «${debouncedQuery.trim()}».`
              : "Пока нет пациентов. Создайте клиента и животное."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {patients.data.map((patient) => (
            <li key={patient.uuid}>
              <Link
                href={`/patients/${patient.uuid}`}
                className="flex items-center justify-between gap-4 rounded-2xl border bg-card px-4 py-3 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{patient.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{patient.client.name}</p>
                </div>
                <div className="shrink-0 text-right text-sm text-muted-foreground">
                  <p>{speciesLabel(patient.species)}</p>
                  <p>{formatWeightKg(patient.body_weight_kg)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CreateClientDialog open={clientOpen} onOpenChange={setClientOpen} />
      <CreatePatientDialog open={patientOpen} onOpenChange={setPatientOpen} />
    </div>
  );
}

function CreateClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createClient = useCreateClient();
  const [values, setValues] = React.useState<ClientFormValues>(emptyClientForm);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValues(emptyClientForm());
      setError(null);
    }
  }, [open]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createClient.mutateAsync(clientFormToPayload(values));
      toast.success("Клиент сохранён");
      onOpenChange(false);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Новый клиент</DialogTitle>
            <DialogDescription>Владелец животного. Имя достаточно, телефон или email — по желанию.</DialogDescription>
          </DialogHeader>
          <ClientContactFields
            idPrefix="new-client"
            name={values.name}
            email={values.email}
            phone={values.phone}
            disabled={createClient.isPending}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={createClient.isPending}>
              {createClient.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatePatientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const createClient = useCreateClient();
  const createPatient = useCreatePatient();
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [clientQuery, setClientQuery] = React.useState("");
  const debouncedClientQuery = useDebouncedValue(clientQuery, 300);
  const clients = useClientsQuery(debouncedClientQuery);
  const [selectedClient, setSelectedClient] = React.useState<ClientRecord | null>(null);
  const [clientValues, setClientValues] = React.useState<ClientFormValues>(emptyClientForm);
  const [patientValues, setPatientValues] = React.useState<PatientFormValues>(emptyPatientForm);
  const [error, setError] = React.useState<string | null>(null);
  const pending = createClient.isPending || createPatient.isPending;

  React.useEffect(() => {
    if (open) {
      setMode("existing");
      setClientQuery("");
      setSelectedClient(null);
      setClientValues(emptyClientForm());
      setPatientValues(emptyPatientForm());
      setError(null);
    }
  }, [open]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const patientPayload = formToPatientPayload(patientValues);
      let clientUuid = selectedClient?.uuid;
      if (mode === "new") {
        const created = await createClient.mutateAsync(clientFormToPayload(clientValues));
        clientUuid = created.uuid;
      } else if (!clientUuid) {
        setError("Выберите клиента или создайте нового");
        return;
      }
      const patient = await createPatient.mutateAsync({
        client_uuid: clientUuid,
        ...patientPayload,
      });
      toast.success("Пациент сохранён");
      onOpenChange(false);
      router.push(`/patients/${patient.uuid}`);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Новый пациент</DialogTitle>
            <DialogDescription>
              Животное всегда привязано к клиенту. Можно выбрать существующего или создать нового.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "existing" ? "default" : "outline"}
              onClick={() => setMode("existing")}
            >
              Существующий клиент
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "new" ? "default" : "outline"}
              onClick={() => setMode("new")}
            >
              Новый клиент
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Input
                type="search"
                value={clientQuery}
                onChange={(event) => setClientQuery(event.target.value)}
                placeholder="Найти клиента по имени, телефону или email"
                disabled={pending}
              />
              {selectedClient ? (
                <p className="text-sm">
                  Выбран: <span className="font-medium">{selectedClient.name}</span>
                </p>
              ) : null}
              {clients.isPending ? (
                <p className="text-sm text-muted-foreground">Загрузка клиентов…</p>
              ) : clients.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  {apiErrorMessage(clients.error)}
                </p>
              ) : !clients.data?.length ? (
                <p className="text-sm text-muted-foreground">Клиенты не найдены.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-1">
                  {clients.data.map((client) => (
                    <li key={client.uuid}>
                      <button
                        type="button"
                        className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                          selectedClient?.uuid === client.uuid ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedClient(client)}
                      >
                        <span className="font-medium">{client.name}</span>
                        <span className="ml-2 text-xs opacity-80">{client.phone || client.email || ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ClientContactFields
              idPrefix="inline-client"
              name={clientValues.name}
              email={clientValues.email}
              phone={clientValues.phone}
              disabled={pending}
              onChange={(patch) => setClientValues((current) => ({ ...current, ...patch }))}
            />
          )}

          <PatientFormFields
            idPrefix="new-patient"
            values={patientValues}
            disabled={pending}
            onChange={(patch) => setPatientValues((current) => ({ ...current, ...patch }))}
          />

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
