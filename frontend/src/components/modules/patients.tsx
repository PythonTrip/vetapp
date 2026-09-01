"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, PanelLeft, Plus, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { PatientDetail, type PatientTab } from "@/components/modules/patient-detail";
import { ClientContactFields, PatientFormFields } from "@/components/patients/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClientRecord, PatientRecord } from "@/lib/api-client";
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
import { cn } from "@/lib/utils";

type PatientsWorkspaceProps = {
  initialPatientId?: string;
  initialTab?: string;
};

function normalizeTab(value?: string): PatientTab {
  if (value === "encounters" || value === "gallery" || value === "comms" || value === "nutrition") {
    return value;
  }
  return "card";
}

function patientHref(patientId: string, tab: PatientTab): string {
  return `/patients/${patientId}?tab=${tab}`;
}

export function PatientsWorkspace({ initialPatientId = "", initialTab }: PatientsWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const patients = usePatientsQuery(debouncedQuery);
  const [patientOpen, setPatientOpen] = React.useState(false);
  const [clientOpen, setClientOpen] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<PatientTab>(() => normalizeTab(initialTab));
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const normalizedInitialTab = normalizeTab(initialTab);

  React.useEffect(() => {
    setActiveTab(normalizedInitialTab);
  }, [normalizedInitialTab]);

  React.useEffect(() => {
    if (!initialPatientId || !initialTab || initialTab === normalizedInitialTab) return;
    router.replace(patientHref(initialPatientId, normalizedInitialTab), { scroll: false });
  }, [initialPatientId, initialTab, normalizedInitialTab, router]);

  React.useEffect(() => {
    if (initialPatientId || debouncedQuery.trim() || !patients.data?.length) return;
    router.replace(patientHref(patients.data[0].uuid, activeTab), { scroll: false });
  }, [activeTab, debouncedQuery, initialPatientId, patients.data, router]);

  function selectTab(nextTab: PatientTab) {
    if (hasUnsavedChanges && !window.confirm("Есть несохранённые изменения. Перейти без сохранения?")) return;
    setActiveTab(nextTab);
    if (initialPatientId) {
      router.replace(patientHref(initialPatientId, nextTab), { scroll: false });
    }
  }

  const listError = patients.isError ? apiErrorMessage(patients.error) : null;

  function handlePatientClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (hasUnsavedChanges && !window.confirm("Есть несохранённые изменения. Сменить пациента без сохранения?")) {
      event.preventDefault();
      return;
    }
    setHasUnsavedChanges(false);
    setSidebarOpen(false);
  }

  const sidebarProps = {
    patients: patients.data ?? [],
    selectedPatientId: initialPatientId,
    activeTab,
    query,
    debouncedQuery,
    isPending: patients.isPending,
    error: listError,
    onQueryChange: setQuery,
    onPatientClick: handlePatientClick,
    onCreatePatient: () => {
      setSidebarOpen(false);
      setPatientOpen(true);
    },
    onCreateClient: () => {
      setSidebarOpen(false);
      setClientOpen(true);
    },
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside className="hidden min-h-0 w-[19rem] shrink-0 border-r bg-muted/20 xl:flex">
        <PatientSidebar {...sidebarProps} />
      </aside>

      <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <DialogContent
          className="left-0 top-0 h-dvh w-[min(19rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 p-0 shadow-xl data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left xl:hidden"
          overlayClassName="xl:hidden"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Список пациентов</DialogTitle>
            <DialogDescription>Выберите пациента для работы с его карточкой.</DialogDescription>
          </DialogHeader>
          <PatientSidebar {...sidebarProps} onClose={() => setSidebarOpen(false)} />
        </DialogContent>
      </Dialog>

      {initialPatientId ? (
        <PatientDetail
          patientId={initialPatientId}
          activeTab={activeTab}
          onTabChange={selectTab}
          onOpenPatientList={() => setSidebarOpen(true)}
          onDirtyChange={setHasUnsavedChanges}
        />
      ) : (
        <PatientWorkspaceEmpty
          loading={patients.isPending}
          hasPatients={Boolean(patients.data?.length)}
          error={listError}
          onOpenPatientList={() => setSidebarOpen(true)}
          onCreatePatient={() => setPatientOpen(true)}
        />
      )}

      <CreatePatientDialog open={patientOpen} onOpenChange={setPatientOpen} />
      <CreateClientDialog open={clientOpen} onOpenChange={setClientOpen} />
    </div>
  );
}

export const PatientsModule = PatientsWorkspace;

function PatientSidebar({
  patients,
  selectedPatientId,
  activeTab,
  query,
  debouncedQuery,
  isPending,
  error,
  onQueryChange,
  onPatientClick,
  onCreatePatient,
  onCreateClient,
  onClose,
}: {
  patients: PatientRecord[];
  selectedPatientId: string;
  activeTab: PatientTab;
  query: string;
  debouncedQuery: string;
  isPending: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onPatientClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  onCreatePatient: () => void;
  onCreateClient: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-h-0 w-full flex-col bg-background/70">
      <div className="shrink-0 border-b px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Пациенты</h1>
            <p className="text-xs text-muted-foreground">
              {isPending ? "Загрузка…" : `${patients.length} ${patients.length === 1 ? "пациент" : "пациентов"}`}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onCreateClient} aria-label="Добавить владельца">
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" className="h-9 w-9" onClick={onCreatePatient} aria-label="Добавить пациента">
              <Plus className="h-4 w-4" />
            </Button>
            {onClose ? (
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Закрыть список пациентов">
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Кличка или владелец"
            className="h-9 bg-background pl-9"
            aria-label="Поиск пациентов"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isPending ? (
          <div className="space-y-2 p-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-[4.25rem] w-full" />)}
          </div>
        ) : error ? (
          <p className="m-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : !patients.length ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {debouncedQuery.trim()
              ? `Ничего не найдено по запросу «${debouncedQuery.trim()}».`
              : "Пока нет пациентов. Добавьте первого пациента."}
          </div>
        ) : (
          <ul className="space-y-1 p-2" aria-label="Пациенты">
            {patients.map((patient) => {
              const active = patient.uuid === selectedPatientId;
              return (
                <li key={patient.uuid}>
                  <Link
                    href={patientHref(patient.uuid, activeTab)}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    onClick={onPatientClick}
                    className={cn(
                      "group flex min-h-[4.25rem] items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "border-primary/20 bg-primary/10 text-foreground" : "hover:bg-muted/70",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{patient.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{patient.client.name}</span>
                    </span>
                    <span className="w-[4.75rem] shrink-0 text-right text-[11px] leading-4 text-muted-foreground">
                      <span className="block truncate">{speciesLabel(patient.species)}</span>
                      <span className="block truncate">{formatWeightKg(patient.body_weight_kg)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function PatientWorkspaceEmpty({
  loading,
  hasPatients,
  error,
  onOpenPatientList,
  onCreatePatient,
}: {
  loading: boolean;
  hasPatients: boolean;
  error: string | null;
  onOpenPatientList: () => void;
  onCreatePatient: () => void;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4 xl:hidden">
        <Button type="button" variant="outline" size="sm" onClick={onOpenPatientList}>
          <PanelLeft className="h-4 w-4" />
          Пациенты
        </Button>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-semibold">
            {loading ? "Загружаем пациентов…" : error ? "Не удалось загрузить пациентов" : hasPatients ? "Выберите пациента" : "Добавьте первого пациента"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {error
              ? `${error} Откройте список, чтобы повторить поиск или выбрать доступного пациента.`
              : hasPatients
              ? "Карточка, приёмы и клинические материалы откроются здесь без возврата к реестру."
              : "После создания пациента его карточка станет постоянным контекстом работы."}
          </p>
          {!loading && !error && !hasPatients ? (
            <Button type="button" className="mt-4" onClick={onCreatePatient}>
              <Plus className="h-4 w-4" />
              Добавить пациента
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CreateClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createClient = useCreateClient();
  const [values, setValues] = React.useState<ClientFormValues>(emptyClientForm);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setValues(emptyClientForm());
    setError(null);
  }, [open]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createClient.mutateAsync(clientFormToPayload(values));
      toast.success("Владелец сохранён");
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
            <DialogTitle>Новый владелец</DialogTitle>
            <DialogDescription>Создайте владельца сейчас, а пациента можно добавить позже.</DialogDescription>
          </DialogHeader>
          <ClientContactFields
            idPrefix="new-client"
            name={values.name}
            email={values.email}
            phone={values.phone}
            disabled={createClient.isPending}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
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

function CreatePatientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
        setError("Выберите владельца или создайте нового");
        return;
      }
      const patient = await createPatient.mutateAsync({ client_uuid: clientUuid, ...patientPayload });
      toast.success("Пациент сохранён");
      onOpenChange(false);
      router.push(patientHref(patient.uuid, "card"), { scroll: false });
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
            <DialogDescription>Выберите владельца или создайте нового, затем заполните клиническую карточку.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>
              Существующий владелец
            </Button>
            <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>
              Новый владелец
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Input type="search" value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="Имя, телефон или email владельца" disabled={pending} />
              {selectedClient ? <p className="text-sm">Выбран: <span className="font-medium">{selectedClient.name}</span></p> : null}
              {clients.isPending ? (
                <p className="text-sm text-muted-foreground">Загрузка владельцев…</p>
              ) : clients.isError ? (
                <p className="text-sm text-destructive" role="alert">{apiErrorMessage(clients.error)}</p>
              ) : !clients.data?.length ? (
                <p className="text-sm text-muted-foreground">Владельцы не найдены.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-1">
                  {clients.data.map((client) => (
                    <li key={client.uuid}>
                      <button
                        type="button"
                        className={cn("w-full rounded-md px-3 py-2 text-left text-sm", selectedClient?.uuid === client.uuid ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
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

          <PatientFormFields idPrefix="new-patient" values={patientValues} disabled={pending} onChange={(patch) => setPatientValues((current) => ({ ...current, ...patch }))} />
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
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
