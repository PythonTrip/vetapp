"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Calculator, FolderOpen, Loader2, PawPrint } from "lucide-react";
import { toast } from "sonner";
import { CommunicationLog } from "@/components/clinical/communication-log";
import { DermatologyGallery } from "@/components/clinical/dermatology-gallery";
import { EncounterPanel } from "@/components/clinical/encounter-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientContactFields, PatientFormFields } from "@/components/patients/form-fields";
import { useDietPlansQuery, usePatientQuery, useUpdateClient, useUpdatePatient } from "@/lib/hooks";
import {
  apiErrorMessage,
  clientFormToPayload,
  emptyClientForm,
  emptyPatientForm,
  formToPatientPayload,
  patientToForm,
  type ClientFormValues,
  type PatientFormValues,
} from "@/lib/patient-form";

export function PatientDetail({ patientId }: { patientId: string }) {
  const patientQuery = usePatientQuery(patientId);
  const plansQuery = useDietPlansQuery(patientId);
  const updateClient = useUpdateClient();
  const updatePatient = useUpdatePatient();
  const [clientValues, setClientValues] = React.useState<ClientFormValues>(emptyClientForm());
  const [patientValues, setPatientValues] = React.useState<PatientFormValues>(emptyPatientForm());
  const [error, setError] = React.useState<string | null>(null);
  const [hydratedId, setHydratedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setHydratedId(null);
  }, [patientId]);

  React.useEffect(() => {
    const patient = patientQuery.data;
    if (!patient || hydratedId === patient.uuid) return;
    setClientValues({
      name: patient.client.name,
      email: patient.client.email ?? "",
      phone: patient.client.phone ?? "",
    });
    setPatientValues(patientToForm(patient));
    setHydratedId(patient.uuid);
    setError(null);
  }, [hydratedId, patientQuery.data]);

  const pending = updateClient.isPending || updatePatient.isPending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patient = patientQuery.data;
    if (!patient) return;
    setError(null);
    try {
      const clientPayload = clientFormToPayload(clientValues);
      const patientPayload = formToPatientPayload(patientValues);
      await updateClient.mutateAsync({ id: patient.client.uuid, body: clientPayload });
      await updatePatient.mutateAsync({ id: patient.uuid, body: patientPayload });
      toast.success("Карточка сохранена");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  if (patientQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6 lg:p-8" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (patientQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/patients">
            <ArrowLeft className="h-4 w-4" />
            К списку
          </Link>
        </Button>
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {apiErrorMessage(patientQuery.error)}
        </p>
      </div>
    );
  }

  const patient = patientQuery.data;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/patients">
              <ArrowLeft className="h-4 w-4" />
              К списку
            </Link>
          </Button>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <PawPrint className="h-3.5 w-3.5" />
            Карточка пациента
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{patient.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{patient.client.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/schedule">Расписание</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/nutrition?patientId=${patient.uuid}`}>
              <Calculator className="h-4 w-4" />
              Открыть в диетологии
            </Link>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="card">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="card">Карточка</TabsTrigger>
          <TabsTrigger value="encounters">Приёмы</TabsTrigger>
          <TabsTrigger value="gallery">Галерея</TabsTrigger>
          <TabsTrigger value="comms">Коммуникации</TabsTrigger>
          <TabsTrigger value="plans">Питание</TabsTrigger>
        </TabsList>

        <TabsContent value="card" className="mt-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Клиент</CardTitle>
                <CardDescription>Контакты владельца хранятся отдельно от животного.</CardDescription>
              </CardHeader>
              <CardContent>
                <ClientContactFields
                  idPrefix="edit-client"
                  name={clientValues.name}
                  email={clientValues.email}
                  phone={clientValues.phone}
                  disabled={pending}
                  onChange={(patch) => setClientValues((current) => ({ ...current, ...patch }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Пациент</CardTitle>
                <CardDescription>Клинические поля карточки используются в анамнезе приёма.</CardDescription>
              </CardHeader>
              <CardContent>
                <PatientFormFields
                  idPrefix="edit-patient"
                  values={patientValues}
                  disabled={pending}
                  onChange={(patch) => setPatientValues((current) => ({ ...current, ...patch }))}
                />
              </CardContent>
            </Card>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Сохранить
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="encounters" className="mt-4">
          <EncounterPanel patient={patient} />
        </TabsContent>

        <TabsContent value="gallery" className="mt-4">
          <DermatologyGallery patientId={patient.uuid} />
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <CommunicationLog patientId={patient.uuid} />
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Планы питания</CardTitle>
              <CardDescription>Открываются из сохранённого snapshot без автоматического пересчёта.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {plansQuery.isPending ? <Skeleton className="h-20 w-full" /> : plansQuery.isError ? (
                <p className="text-sm text-destructive" role="alert">{apiErrorMessage(plansQuery.error)}</p>
              ) : plansQuery.data?.length ? plansQuery.data.map((plan) => (
                <Link key={plan.uuid} href={`/nutrition?planId=${plan.uuid}`} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <span><strong>{plan.name}</strong><span className="ml-2 text-xs text-muted-foreground">FEDIAF {plan.edition_code}</span></span>
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                </Link>
              )) : <p className="py-4 text-center text-sm text-muted-foreground">Для пациента ещё нет сохранённых планов</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
