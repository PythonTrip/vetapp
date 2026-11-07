"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
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
import { consultationState, VISIT_STATUS_STYLES } from "@vetdietderm/owner-features/domain";
import { useAuth } from "@/features/authentication/auth-provider";

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

export function ScheduleBoard({ queue, requestCount }: { queue?: React.ReactNode; requestCount?: number }) {
  const { user } = useAuth();
  const viewer = user?.organization?.org_role === "viewer";
  const [view, setView] = React.useState<"appointments" | "requests">("appointments");
  const [day, setDay] = React.useState(toDateInput(new Date()));
  const selected = new Date(`${day}T00:00:00`);
  const range = {
    from: startOfDay(selected).toISOString(),
    to: endOfDay(selected).toISOString(),
  };
  const query = useAppointmentsQuery(range);
  const [now, setNow] = React.useState(Date.now);
  const refresh = query.refetch;
  React.useEffect(() => {
    const update = () => { if (!document.hidden) { setNow(Date.now()); void refresh(); } };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);
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
  const [amountRub, setAmountRub] = React.useState("");
  const [paid, setPaid] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const chargeLocked = viewer || Boolean(editing?.paid);

  function openNew() {
    setPatientSearch("");
    setEditing(null);
    setPatientId("");
    setStartsAt(`${day}T10:00`);
    setDurationMin("30");
    setVisitType("consultation");
    setStatus("scheduled");
    setNotes("");
    setAmountRub("");
    setPaid(false);
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
    setAmountRub(item.amount_rub ?? "");
    setPaid(Boolean(item.paid));
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
    const amount = amountRub.trim().replace(",", ".");
    const body = {
      patient_uuid: patientId,
      starts_at: fromDateTimeLocal(startsAt),
      duration_min: duration,
      visit_type: visitType,
      status,
      notes: notes.trim() || null,
      ...(status === "completed" && !chargeLocked
        ? { amount_rub: amount || null, paid: amount ? paid : false }
        : {}),
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
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Расписание и заявки</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            День клиники: создание, перенос, отмена и переход в карточку пациента.
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Новая запись
        </Button>
      </div>

      {queue && <nav aria-label="Разделы расписания" className="flex flex-wrap gap-2"><Button type="button" variant={view === "appointments" ? "default" : "outline"} aria-pressed={view === "appointments"} className="min-h-11" onClick={() => setView("appointments")}>Расписание</Button><Button type="button" variant={view === "requests" ? "default" : "outline"} aria-pressed={view === "requests"} className="min-h-11" onClick={() => setView("requests")}>Заявки владельцев{requestCount === undefined ? "" : ` · ${requestCount}`}</Button></nav>}
      {queue && <div hidden={view !== "requests"}>{queue}</div>}

      <div hidden={view !== "appointments"} className="space-y-6">

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
          <CardDescription>Откройте запись, чтобы изменить время или статус. Результаты публикуются в карточке пациента, в разделе «Галерея».</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.isPending ? <Skeleton className="h-24 w-full" /> : null}
          {query.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {apiErrorMessage(query.error)}
            </p>
          ) : null}
          {items.map((item) => (
            <div key={item.uuid} className="flex flex-col items-start justify-between gap-3 rounded-lg border p-3 sm:flex-row">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openExisting(item)}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{formatDateTime(item.starts_at)}</strong>
                  <Badge variant="outline">{item.duration_min} мин</Badge>
                  <Badge variant="secondary">{VISIT_TYPE_LABELS[item.visit_type]}</Badge>
                  <Badge className={VISIT_STATUS_STYLES[consultationState(item.status, item.starts_at, item.encounter_status, now).tone]}>{consultationState(item.status, item.starts_at, item.encounter_status, now).label}</Badge>
                </div>
                <p className="mt-1 text-sm">
                  {item.patient.name} · {speciesLabel(item.patient.species)} · {item.patient.client.name}
                </p>
                {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
                {item.amount_rub != null && <p className="text-sm">{item.paid ? "Оплачено" : "К оплате"}: {item.amount_rub} руб.</p>}
              </button>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {(item.encounter_uuid || item.status === "scheduled") && <Button asChild variant="outline" size="sm">
                  <Link href={`/encounter?appointmentId=${item.uuid}`}>
                    <Stethoscope className="h-4 w-4" />
                    {item.encounter_uuid ? "Открыть приём" : "Начать приём"}
                  </Link>
                </Button>}
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/patients/${item.patient_uuid}`}>Карточка</Link>
                </Button>
                {(item.status === "completed" || item.encounter_status === "completed") && <Button asChild variant="outline" size="sm"><Link href={`/patients/${item.patient_uuid}?tab=gallery`}>Результаты</Link></Button>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Удалить запись: ${item.patient.name}`}
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
            {status === "completed" ? <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="appt-amount">Сумма, руб.</Label>
                <Input id="appt-amount" inputMode="decimal" disabled={chargeLocked} value={amountRub} onChange={(event) => setAmountRub(event.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={paid} disabled={chargeLocked || amountRub.trim() === ""} onCheckedChange={(value) => setPaid(value === true)} />
                Оплачено
              </label>
            </div> : null}
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
    </div>
  );
}
