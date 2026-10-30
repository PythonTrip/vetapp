"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Loader2, Plus, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { Textarea } from "@/shared/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { AppointmentRecord, AppointmentStatus, BookableVisitType, VisitType } from "@/features/appointments/api";
import type { PatientRecord } from "@/features/patients/api";
import { APPOINTMENT_STATUS_LABELS, BOOKABLE_VISIT_TYPES, VISIT_TYPE_LABELS } from "@/features/appointments/labels";
import { formatDateTime, fromDateTimeLocal, toDateTimeLocal } from "@/shared/lib/date-time";
import { useAppointmentsQuery, useCreateAppointment, useDeleteAppointment, useUpdateAppointment } from "@/features/appointments/hooks";
import { usePatientsQuery, usePatientQuery } from "@/features/patients/hooks";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { apiErrorMessage } from "@/shared/api/error-message";
import { speciesLabel } from "@/features/patients/form";

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function toDateInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ScheduleBoard() {
  const [day, setDay] = React.useState(toDateInput(new Date()));
  const selected = new Date(`${day}T00:00:00`);
  const range = {
    from: startOfDay(selected).toISOString(),
    to: endOfDay(selected).toISOString(),
  };
  const query = useAppointmentsQuery(range);
  const [patientSearch, setPatientSearch] = React.useState("");
  const debouncedPatientSearch = useDebouncedValue(patientSearch, 250);
  const patients = usePatientsQuery(debouncedPatientSearch);
  const createItem = useCreateAppointment();
  const updateItem = useUpdateAppointment();
  const deleteItem = useDeleteAppointment();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AppointmentRecord | null>(null);
  const [patientId, setPatientId] = React.useState("");
  const selectedPatientQuery = usePatientQuery(patientId);
  const selectedPatient = selectedPatientQuery.data ?? (editing?.patient_uuid === patientId ? editing.patient : null);
  const patientOptions = [...(selectedPatient ? [selectedPatient] : []),
    ...(patients.data ?? []).filter((patient) => patient.uuid !== selectedPatient?.uuid)];
  const [startsAt, setStartsAt] = React.useState("");
  const [durationMin, setDurationMin] = React.useState("30");
  const [visitType, setVisitType] = React.useState<VisitType>("consultation");
  const [status, setStatus] = React.useState<AppointmentStatus>("scheduled");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function openNew() {
    setPatientSearch("");
    setEditing(null);
    setPatientId("");
    setStartsAt(`${day}T10:00`);
    setDurationMin("30");
    setVisitType("consultation");
    setStatus("scheduled");
    setNotes("");
    setError(null);
    setOpen(true);
  }

  function openExisting(item: AppointmentRecord) {
    setPatientSearch("");
    setEditing(item);
    setPatientId(item.patient_uuid);
    setStartsAt(toDateTimeLocal(item.starts_at));
    setDurationMin(String(item.duration_min));
    setVisitType(item.visit_type);
    setStatus(item.status);
    setNotes(item.notes ?? "");
    setError(null);
    setOpen(true);
  }

  async function onSave() {
    if (!patientId) {
      setError("Выберите пациента");
      return;
    }
    const duration = Number(durationMin);
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      setError("Длительность должна быть от 5 до 480 минут");
      return;
    }
    setError(null);
    const body = {
      patient_uuid: patientId,
      starts_at: fromDateTimeLocal(startsAt),
      duration_min: duration,
      visit_type: visitType,
      status,
      notes: notes.trim() || null,
    };
    try {
      if (editing) {
        await updateItem.mutateAsync({ id: editing.uuid, body });
        toast.success("Запись сохранена");
      } else {
        const bookable = BOOKABLE_VISIT_TYPES.find(type => type === visitType);
        if (!bookable) throw new Error("Выберите доступный тип визита");
        await createItem.mutateAsync({ ...body, visit_type: bookable satisfies BookableVisitType });
        toast.success("Запись создана");
      }
      setOpen(false);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }

  const pending = createItem.isPending || updateItem.isPending;
  const items = query.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <CalendarDays className="h-3.5 w-3.5" />
            Расписание
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Записи</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            День клиники: создание, перенос, отмена и переход в карточку пациента.
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Новая запись
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="schedule-day">День</Label>
          <Input id="schedule-day" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => setDay(toDateInput(new Date()))}>
          Сегодня
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Список на {day}</CardTitle>
          <CardDescription>Статусы: запланирована, завершена, отменена, не явился.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {query.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {apiErrorMessage(query.error)}
            </p>
          ) : null}
          {items.map((item) => (
            <div key={item.uuid} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openExisting(item)}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{formatDateTime(item.starts_at)}</strong>
                  <Badge variant="outline">{item.duration_min} мин</Badge>
                  <Badge variant="secondary">{VISIT_TYPE_LABELS[item.visit_type]}</Badge>
                  <Badge>{APPOINTMENT_STATUS_LABELS[item.status]}</Badge>
                </div>
                <p className="mt-1 text-sm">
                  {item.patient.name} · {speciesLabel(item.patient.species)} · {item.patient.client.name}
                </p>
                {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
              </button>
              <div className="flex items-center gap-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/encounter?appointmentId=${item.uuid}`}>
                    <Stethoscope className="h-4 w-4" />
                    {item.encounter_uuid ? "Открыть приём" : "Начать приём"}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/patients/${item.patient_uuid}`}>Карточка</Link>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (!window.confirm("Удалить запись?")) return;
                    void deleteItem.mutateAsync(item.uuid).then(
                      () => toast.success("Запись удалена"),
                      (cause) => toast.error(apiErrorMessage(cause)),
                    );
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {!query.isPending && items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">На этот день записей нет</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Запись" : "Новая запись"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Пациент</Label>
              <Input aria-label="Поиск пациента" placeholder="Имя пациента или владельца" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} />
              {patients.isFetching ? <p role="status" className="text-sm text-muted-foreground">Поиск…</p> : null}
              {patients.isError ? <p role="alert" className="text-sm text-destructive">{apiErrorMessage(patients.error)}</p> : null}
              {!patients.isFetching && !patients.isError && !patients.data?.length ? <p role="status" className="text-sm text-muted-foreground">Пациенты не найдены. Уточните поиск.</p> : null}
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите пациента" />
                </SelectTrigger>
                <SelectContent>
                  {patientOptions.map((patient: PatientRecord) => (
                    <SelectItem key={patient.uuid} value={patient.uuid}>
                      {patient.name} · {patient.client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-start">Начало</Label>
              <Input id="appt-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-duration">Длительность, мин</Label>
              <Input id="appt-duration" inputMode="numeric" value={durationMin} onChange={(event) => setDurationMin(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Тип визита</Label>
              <Select value={visitType} onValueChange={(value) => setVisitType(value as VisitType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...BOOKABLE_VISIT_TYPES, ...(editing && !BOOKABLE_VISIT_TYPES.some(type => type === editing.visit_type) ? [editing.visit_type] : [])].map(value => (
                    <SelectItem key={value} value={value}>
                      {VISIT_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Статус</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as AppointmentStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-notes">Заметки</Label>
              <Textarea id="appt-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void onSave()} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
