"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Loader2,
  Mail,
  PanelLeft,
  Pencil,
  Phone,
  Plus,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CommunicationLog } from "@/components/clinical/communication-log";
import { DermatologyGallery } from "@/components/clinical/dermatology-gallery";
import { EncounterPanel } from "@/components/clinical/encounter-panel";
import { ClientContactFields, PatientFormFields } from "@/components/patients/form-fields";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PatientRecord } from "@/lib/api-client";
import { useDietPlansQuery, usePatientQuery, useUpdateClient, useUpdatePatient } from "@/lib/hooks";
import {
  ACTIVITY_OPTIONS,
  apiErrorMessage,
  clientFormToPayload,
  emptyClientForm,
  emptyPatientForm,
  formToPatientPayload,
  formatWeightKg,
  LIFE_STAGE_OPTIONS,
  patientToForm,
  speciesLabel,
  type ClientFormValues,
  type PatientFormValues,
} from "@/lib/patient-form";

export type PatientTab = "card" | "encounters" | "gallery" | "comms" | "nutrition";

const PATIENT_TABS: { value: PatientTab; label: string }[] = [
  { value: "card", label: "Карточка" },
  { value: "encounters", label: "Приёмы" },
  { value: "gallery", label: "Галерея" },
  { value: "comms", label: "Коммуникации" },
  { value: "nutrition", label: "Питание" },
];

type PatientDetailProps = {
  patientId: string;
  activeTab: PatientTab;
  onTabChange: (tab: PatientTab) => void;
  onOpenPatientList: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

export function PatientDetail({ patientId, activeTab, onTabChange, onOpenPatientList, onDirtyChange }: PatientDetailProps) {
  const patientQuery = usePatientQuery(patientId);
  const updateClient = useUpdateClient();
  const updatePatient = useUpdatePatient();
  const [clientValues, setClientValues] = React.useState<ClientFormValues>(emptyClientForm);
  const [patientValues, setPatientValues] = React.useState<PatientFormValues>(emptyPatientForm);
  const [error, setError] = React.useState<string | null>(null);
  const [hydratedId, setHydratedId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);

  const dirty = React.useMemo(() => {
    const patient = patientQuery.data;
    if (!editing || !patient) return false;
    const storedClient: ClientFormValues = {
      name: patient.client.name,
      email: patient.client.email ?? "",
      phone: patient.client.phone ?? "",
    };
    return JSON.stringify(clientValues) !== JSON.stringify(storedClient)
      || JSON.stringify(patientValues) !== JSON.stringify(patientToForm(patient));
  }, [clientValues, editing, patientQuery.data, patientValues]);

  React.useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const hydrateForms = React.useCallback((patient: PatientRecord) => {
    setClientValues({
      name: patient.client.name,
      email: patient.client.email ?? "",
      phone: patient.client.phone ?? "",
    });
    setPatientValues(patientToForm(patient));
  }, []);

  React.useEffect(() => {
    setHydratedId(null);
    setEditing(false);
    setError(null);
  }, [patientId]);

  React.useEffect(() => {
    const patient = patientQuery.data;
    if (!patient || hydratedId === patient.uuid) return;
    hydrateForms(patient);
    setHydratedId(patient.uuid);
  }, [hydrateForms, hydratedId, patientQuery.data]);

  const pending = updateClient.isPending || updatePatient.isPending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patient = patientQuery.data;
    if (!patient) return;
    setError(null);
    try {
      await updateClient.mutateAsync({ id: patient.client.uuid, body: clientFormToPayload(clientValues) });
      await updatePatient.mutateAsync({ id: patient.uuid, body: formToPatientPayload(patientValues) });
      toast.success("Карточка сохранена");
      setEditing(false);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  function cancelEditing() {
    if (patientQuery.data) hydrateForms(patientQuery.data);
    setError(null);
    setEditing(false);
  }

  if (patientQuery.isPending) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-busy="true">
        <div className="shrink-0 border-b p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="icon" className="xl:hidden" onClick={onOpenPatientList} aria-label="Открыть список пациентов">
              <PanelLeft className="h-4 w-4" />
            </Button>
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </section>
    );
  }

  if (patientQuery.isError) {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4 xl:hidden">
          <Button type="button" variant="outline" size="sm" onClick={onOpenPatientList}>
            <PanelLeft className="h-4 w-4" />
            Пациенты
          </Button>
        </div>
        <div className="p-4 sm:p-6">
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
            {apiErrorMessage(patientQuery.error)} Выберите другого пациента в списке.
          </p>
        </div>
      </section>
    );
  }

  const patient = patientQuery.data;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PatientHeader patient={patient} onOpenPatientList={onOpenPatientList} />

      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as PatientTab)}
        className="min-h-0 flex-1 gap-0 overflow-hidden"
      >
        <div className="scrollbar-none shrink-0 overflow-x-auto border-b px-3 sm:px-5">
          <TabsList className="h-11 w-max min-w-full justify-start gap-1 rounded-none bg-transparent p-0">
            {PATIENT_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-11 flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none sm:text-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="card" className="mt-0 min-h-0 overflow-y-auto">
          <PatientOverview
            patient={patient}
            editing={editing}
            pending={pending}
            error={error}
            clientValues={clientValues}
            patientValues={patientValues}
            onEdit={() => setEditing(true)}
            onCancel={cancelEditing}
            onSubmit={onSubmit}
            onClientChange={(patch) => setClientValues((current) => ({ ...current, ...patch }))}
            onPatientChange={(patch) => setPatientValues((current) => ({ ...current, ...patch }))}
          />
        </TabsContent>

        <TabsContent value="encounters" className="mt-0 min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-6xl"><EncounterPanel patient={patient} /></div>
        </TabsContent>

        <TabsContent value="gallery" className="mt-0 min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-6xl"><DermatologyGallery patientId={patient.uuid} /></div>
        </TabsContent>

        <TabsContent value="comms" className="mt-0 min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-6xl"><CommunicationLog patientId={patient.uuid} /></div>
        </TabsContent>

        <TabsContent value="nutrition" className="mt-0 min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-6xl"><PatientNutrition patient={patient} /></div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function PatientHeader({ patient, onOpenPatientList }: { patient: PatientRecord; onOpenPatientList: () => void }) {
  return (
    <header className="shrink-0 bg-background px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <Button type="button" variant="outline" size="icon" className="mt-0.5 shrink-0 xl:hidden" onClick={onOpenPatientList} aria-label="Открыть список пациентов">
          <PanelLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{patient.name}</h1>
            <span className="text-sm text-muted-foreground">{patient.client.name}</span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {speciesLabel(patient.species)} · {patient.breed || "порода не указана"} · {formatWeightKg(patient.body_weight_kg)}
          </p>
        </div>
      </div>
    </header>
  );
}

function PatientOverview({
  patient,
  editing,
  pending,
  error,
  clientValues,
  patientValues,
  onEdit,
  onCancel,
  onSubmit,
  onClientChange,
  onPatientChange,
}: {
  patient: PatientRecord;
  editing: boolean;
  pending: boolean;
  error: string | null;
  clientValues: ClientFormValues;
  patientValues: PatientFormValues;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClientChange: (patch: Partial<ClientFormValues>) => void;
  onPatientChange: (patch: Partial<PatientFormValues>) => void;
}) {
  if (editing) {
    return (
      <form onSubmit={onSubmit} className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <h2 className="text-base font-semibold">Редактирование карточки</h2>
            <p className="mt-1 text-sm text-muted-foreground">Изменения владельца и пациента сохраняются в существующие записи.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              <X className="h-4 w-4" />
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Сохранить
            </Button>
          </div>
        </div>

        <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section>
            <h3 className="mb-4 text-sm font-semibold">Клинические данные</h3>
            <PatientFormFields idPrefix="edit-patient" values={patientValues} disabled={pending} onChange={onPatientChange} />
          </section>
          <section className="h-fit rounded-xl bg-muted/60 p-4">
            <h3 className="mb-4 text-sm font-semibold">Владелец</h3>
            <ClientContactFields
              idPrefix="edit-client"
              name={clientValues.name}
              email={clientValues.email}
              phone={clientValues.phone}
              disabled={pending}
              onChange={onClientChange}
            />
          </section>
        </div>
        {error ? <p className="border-t pt-4 text-sm text-destructive" role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-base font-semibold">Карточка пациента</h2>
          <p className="mt-1 text-sm text-muted-foreground">Клинические данные и контакт владельца.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Редактировать
        </Button>
      </div>

      <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-7">
          <section aria-labelledby="patient-primary-data">
            <h3 id="patient-primary-data" className="mb-3 text-sm font-semibold">Основные данные</h3>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label="Кличка" value={patient.name} />
              <Fact label="Вид" value={speciesLabel(patient.species)} />
              <Fact label="Порода" value={patient.breed || "—"} />
              <Fact label="Дата рождения" value={formatBirthDate(patient.birth_date)} />
              <Fact label="Возраст" value={formatAge(patient.birth_date)} />
              <Fact label="Вес" value={formatWeightKg(patient.body_weight_kg)} />
              <Fact label="BCS" value={patient.bcs == null ? "—" : `${patient.bcs} / 9`} />
              <Fact label="Ожидаемый взрослый вес" value={formatWeightKg(patient.expected_adult_weight_kg)} />
              <Fact label="Жизненная стадия" value={optionLabel(LIFE_STAGE_OPTIONS, patient.life_stage)} />
              <Fact label="Активность" value={optionLabel(ACTIVITY_OPTIONS, patient.activity)} />
              <Fact label="Репродуктивный статус" value={reproductiveStatus(patient)} />
              {patient.lactating ? <Fact label="Лактация" value={lactationSummary(patient)} /> : null}
            </dl>
          </section>

          <section className="border-t pt-5" aria-labelledby="patient-clinical-notes">
            <h3 id="patient-clinical-notes" className="mb-3 text-sm font-semibold">Клинические особенности</h3>
            <dl className="space-y-4">
              <Fact label="Аллергии" value={listValue(patient.allergies)} />
              <Fact label="Хронические состояния" value={listValue(patient.chronic_conditions)} />
              <Fact label="Кормление" value={patient.feeding_notes || "—"} />
            </dl>
          </section>
        </div>

        <OwnerPanel patient={patient} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-5 text-foreground">{value}</dd>
    </div>
  );
}

function OwnerPanel({ patient }: { patient: PatientRecord }) {
  return (
    <aside className="h-fit rounded-xl bg-muted/60 p-4" aria-labelledby="patient-owner">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 text-primary" />
        <h3 id="patient-owner" className="text-sm font-semibold">Владелец</h3>
      </div>
      <p className="mt-3 break-words text-sm font-medium">{patient.client.name}</p>
      <div className="mt-3 space-y-2 text-sm">
        {patient.client.phone ? (
          <a href={`tel:${patient.client.phone}`} className="flex items-start gap-2 text-muted-foreground hover:text-primary">
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{patient.client.phone}</span>
          </a>
        ) : <p className="text-muted-foreground">Телефон не указан</p>}
        {patient.client.email ? (
          <a href={`mailto:${patient.client.email}`} className="flex items-start gap-2 text-muted-foreground hover:text-primary">
            <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{patient.client.email}</span>
          </a>
        ) : <p className="text-muted-foreground">Email не указан</p>}
      </div>
    </aside>
  );
}

function PatientNutrition({ patient }: { patient: PatientRecord }) {
  const plansQuery = useDietPlansQuery(patient.uuid);

  return (
    <section aria-labelledby="patient-nutrition-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 id="patient-nutrition-title" className="text-base font-semibold">Планы питания</h2>
          <p className="mt-1 text-sm text-muted-foreground">Сохранённые рационы пациента без автоматического пересчёта.</p>
        </div>
        <Button asChild size="sm">
          <Link href={`/nutrition?patientId=${patient.uuid}`}>
            <Plus className="h-4 w-4" />
            Новый план
          </Link>
        </Button>
      </div>

      {plansQuery.isPending ? (
        <div className="space-y-2 py-5" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : plansQuery.isError ? (
        <p className="py-5 text-sm text-destructive" role="alert">{apiErrorMessage(plansQuery.error)}</p>
      ) : plansQuery.data?.length ? (
        <ul className="divide-y">
          {plansQuery.data.map((plan) => (
            <li key={plan.uuid}>
              <Link href={`/nutrition?planId=${plan.uuid}&patientId=${patient.uuid}`} className="group flex items-center justify-between gap-4 py-4 text-sm hover:text-primary">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground group-hover:text-primary">{plan.name}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> FEDIAF {plan.edition_code}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-10 text-center">
          <FolderOpen className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Для пациента ещё нет сохранённых планов.</p>
        </div>
      )}
    </section>
  );
}

function optionLabel(options: readonly { value: string; label: string }[], value: string | null): string {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}

function listValue(items: string[]): string {
  return items.length ? items.join(", ") : "—";
}

function formatBirthDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function formatAge(value: string | null): string {
  if (!value) return "—";
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "—";
  const today = new Date();
  let months = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return "—";
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  if (!years) return `${restMonths} мес.`;
  return restMonths ? `${years} г. ${restMonths} мес.` : `${years} г.`;
}

function reproductiveStatus(patient: PatientRecord): string {
  const statuses = [
    patient.neutered ? "кастрирован / стерилизован" : "не кастрирован / не стерилизован",
    patient.pregnant ? "беременность" : null,
    patient.lactating ? "лактация" : null,
  ].filter(Boolean);
  return statuses.join(", ");
}

function lactationSummary(patient: PatientRecord): string {
  const values = [
    patient.lactation_week == null ? null : `${patient.lactation_week}-я неделя`,
    patient.litter_size == null ? null : `помёт ${patient.litter_size}`,
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "Отмечена";
}
