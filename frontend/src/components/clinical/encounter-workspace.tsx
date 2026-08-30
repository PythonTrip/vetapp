"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Check,
  ChevronRight,
  ClipboardList,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Stethoscope,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AppointmentRecord,
  EncounterRecord,
  EncounterSpecialty,
  EncounterTemplateRecord,
  EncounterTemplateScope,
  EncounterTemplateSection,
  EncounterType,
  EncounterWrite,
} from "@/lib/api-client";
import {
  ENCOUNTER_TYPE_LABELS,
  SPECIALTY_LABELS,
  VISIT_TYPE_LABELS,
  formatDateTime,
  fromDateTimeLocal,
  toDateTimeLocal,
} from "@/lib/clinical-labels";
import {
  useAppointmentsQuery,
  useCreateEncounter,
  useCreateEncounterTemplate,
  useDebouncedValue,
  useDeleteEncounterTemplate,
  useEncounterTemplatesQuery,
  useEncountersQuery,
  usePatientsQuery,
  useUpdateAppointment,
  useUpdateEncounter,
  useUpdateEncounterTemplate,
} from "@/lib/hooks";
import { apiErrorMessage, speciesLabel } from "@/lib/patient-form";
import { cn } from "@/lib/utils";

const DOCTOR_NAME_KEY = "vetdietderm.doctor_name";

const SCOPE_LABELS: Record<EncounterTemplateScope, string> = {
  standard: "Стандарт",
  clinic: "Клиника",
  doctor: "Врач",
};

const SECTION_META: Record<
  EncounterTemplateSection,
  { title: string; genitive: string; description: string; placeholder: string; icon: React.ElementType }
> = {
  anamnesis: {
    title: "Анамнез",
    genitive: "анамнеза",
    description: "История жалоб, динамика, прежнее лечение и важные сведения владельца.",
    placeholder: "Введите анамнез или примените шаблон справа…",
    icon: ClipboardList,
  },
  exam: {
    title: "Осмотр",
    genitive: "осмотра",
    description: "Объективные данные клинического осмотра и выполненных исследований.",
    placeholder: "Опишите результаты осмотра…",
    icon: Stethoscope,
  },
  plan: {
    title: "План",
    genitive: "плана",
    description: "Диагностика, назначения, рекомендации владельцу и контроль.",
    placeholder: "Сформируйте план диагностики и лечения…",
    icon: CalendarCheck,
  },
};

function appointmentLabel(appointment: AppointmentRecord): string {
  return `${formatDateTime(appointment.starts_at)} · ${appointment.patient.name} · ${VISIT_TYPE_LABELS[appointment.visit_type]}`;
}

function emptyForm() {
  return {
    specialty: "general" as EncounterSpecialty,
    type: "appointment" as EncounterType,
    occurredAt: toDateTimeLocal(new Date().toISOString()),
    chiefComplaint: "",
    anamnesis: "",
    exam: "",
    plan: "",
    diagnoses: "",
    vasScore: null as number | null,
  };
}

type SectionEditorProps = {
  section: EncounterTemplateSection;
  value: string;
  templates: EncounterTemplateRecord[];
  pending?: boolean;
  onChange: (value: string) => void;
  onCreate: (section: EncounterTemplateSection, body: string) => void;
  onEdit: (template: EncounterTemplateRecord) => void;
  onDelete: (template: EncounterTemplateRecord) => void;
};

function SectionEditor({
  section,
  value,
  templates,
  pending,
  onChange,
  onCreate,
  onEdit,
  onDelete,
}: SectionEditorProps) {
  const meta = SECTION_META[section];
  const Icon = meta.icon;
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<EncounterTemplateScope | "all">("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const filtered = templates.filter((template) => {
    if (scope !== "all" && template.scope !== scope) return false;
    if (!normalizedQuery) return true;
    return `${template.title} ${template.body}`.toLocaleLowerCase("ru").includes(normalizedQuery);
  });

  function applyTemplate(template: EncounterTemplateRecord) {
    onChange(value.trim() ? `${value.trim()}\n\n${template.body}` : template.body);
    toast.success(`Шаблон «${template.title}» добавлен`);
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-[0_12px_34px_-26px_oklch(0.25_0.04_175/0.38)]">
      <div className="flex flex-col gap-2 border-b bg-muted/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="font-semibold tracking-tight">{meta.title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit font-normal">
          {value.trim().length} знаков
        </Badge>
      </div>

      <div className="grid min-h-[390px] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-h-[390px] flex-col p-3 sm:p-5 xl:border-r">
          <Label htmlFor={`encounter-${section}`} className="sr-only">
            {meta.title}
          </Label>
          <Textarea
            id={`encounter-${section}`}
            value={value}
            disabled={pending}
            onChange={(event) => onChange(event.target.value)}
            placeholder={meta.placeholder}
            className="min-h-[340px] flex-1 resize-y border-0 bg-transparent p-2 text-[15px] leading-7 shadow-none focus-visible:ring-0 sm:min-h-[360px]"
          />
        </div>

        <aside className="flex min-h-[390px] flex-col bg-muted/20">
          <div className="space-y-3 border-b p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Шаблоны {meta.genitive}</h3>
                <p className="text-xs text-muted-foreground">Нажмите, чтобы добавить в текст</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => onCreate(section, value)}>
                <Plus className="h-3.5 w-3.5" />
                Создать
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск шаблона"
                className="bg-background pl-9"
                aria-label={`Поиск шаблонов раздела ${meta.title}`}
              />
            </div>
            <div className="flex flex-wrap gap-1" aria-label="Фильтр шаблонов">
              {(["all", "standard", "clinic", "doctor"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setScope(item)}
                  aria-pressed={scope === item}
                  className={cn(
                    "min-h-8 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    scope === item ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item === "all" ? "Все" : SCOPE_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[360px] flex-1 space-y-2 overflow-y-auto p-3 scrollbar-thin sm:p-4 xl:max-h-none">
            {filtered.map((template) => (
              <div
                key={template.uuid}
                className="group rounded-xl bg-background p-3 shadow-[0_5px_18px_-16px_oklch(0.25_0.04_175/0.45)] ring-1 ring-border/70 transition-shadow hover:shadow-[0_9px_24px_-17px_oklch(0.25_0.04_175/0.55)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => applyTemplate(template)}>
                    <span className="flex items-center gap-2">
                      <strong className="truncate text-xs font-semibold">{template.title}</strong>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[9px] font-medium">
                        {SCOPE_LABELS[template.scope]}
                      </Badge>
                    </span>
                    <span className="mt-1.5 line-clamp-3 block text-xs leading-5 text-muted-foreground">
                      {template.body}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      Использовать <ChevronRight className="h-3 w-3" />
                    </span>
                  </button>
                  {template.scope !== "standard" ? (
                    <div className="flex shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(template)} aria-label={`Изменить шаблон ${template.title}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(template)} aria-label={`Удалить шаблон ${template.title}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {!filtered.length ? (
              <div className="px-3 py-10 text-center">
                <FilePlus2 className="mx-auto h-6 w-6 text-muted-foreground/60" />
                <p className="mt-2 text-xs font-medium">Шаблоны не найдены</p>
                <p className="mt-1 text-xs text-muted-foreground">Измените поиск или создайте свой шаблон.</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

type Props = {
  initialAppointmentId?: string;
  initialPatientId?: string;
  initialEncounterId?: string;
};

export function EncounterWorkspace({ initialAppointmentId, initialPatientId, initialEncounterId }: Props) {
  const [byAppointment, setByAppointment] = React.useState(Boolean(initialAppointmentId));
  const [appointmentId, setAppointmentId] = React.useState(initialAppointmentId ?? "");
  const [patientId, setPatientId] = React.useState(initialPatientId ?? "");
  const [doctorName, setDoctorName] = React.useState("");
  const [editingEncounterId, setEditingEncounterId] = React.useState(initialEncounterId ?? "");
  const [form, setForm] = React.useState(emptyForm);
  const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<EncounterTemplateRecord | null>(null);
  const [templateSection, setTemplateSection] = React.useState<EncounterTemplateSection>("anamnesis");
  const [templateScope, setTemplateScope] = React.useState<"clinic" | "doctor">("doctor");
  const [templateTitle, setTemplateTitle] = React.useState("");
  const [templateBody, setTemplateBody] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [contextQuery, setContextQuery] = React.useState("");
  const [pendingAction, setPendingAction] = React.useState<"draft" | "complete" | null>(null);
  const loadedContext = React.useRef("");

  const appointments = useAppointmentsQuery();
  const patients = usePatientsQuery("");
  const patientEncounters = useEncountersQuery(patientId);
  const createEncounter = useCreateEncounter(patientId);
  const updateEncounter = useUpdateEncounter(patientId);
  const updateAppointment = useUpdateAppointment();
  const debouncedDoctorName = useDebouncedValue(doctorName, 250);
  const templateQuery = useEncounterTemplatesQuery(debouncedDoctorName);
  const createTemplate = useCreateEncounterTemplate();
  const updateTemplate = useUpdateEncounterTemplate();
  const deleteTemplate = useDeleteEncounterTemplate();

  const selectedAppointment = (appointments.data ?? []).find((item) => item.uuid === appointmentId) ?? null;
  const selectedPatient = (patients.data ?? []).find((item) => item.uuid === patientId) ?? selectedAppointment?.patient ?? null;
  const editingRecord = patientEncounters.data?.find((item) => item.uuid === editingEncounterId) ?? null;
  const normalizedContextQuery = contextQuery.trim().toLocaleLowerCase("ru");
  const filteredAppointments = (appointments.data ?? []).filter((appointment) => {
    if (!normalizedContextQuery) return true;
    return appointmentLabel(appointment).toLocaleLowerCase("ru").includes(normalizedContextQuery);
  });
  const filteredPatients = (patients.data ?? []).filter((patient) => {
    if (!normalizedContextQuery) return true;
    return `${patient.name} ${patient.client.name} ${patient.breed ?? ""}`
      .toLocaleLowerCase("ru")
      .includes(normalizedContextQuery);
  });

  const loadEncounter = React.useCallback((encounter: EncounterRecord) => {
    setEditingEncounterId(encounter.uuid);
    setForm({
      specialty: encounter.specialty,
      type: encounter.type,
      occurredAt: toDateTimeLocal(encounter.occurred_at),
      chiefComplaint: encounter.chief_complaint ?? "",
      anamnesis: encounter.anamnesis ?? encounter.anamnesis_data?.free_text ?? "",
      exam: encounter.exam ?? "",
      plan: encounter.plan ?? "",
      diagnoses: encounter.diagnoses.join(", "),
      vasScore: encounter.vas_score,
    });
  }, []);

  React.useEffect(() => {
    setDoctorName(window.localStorage.getItem(DOCTOR_NAME_KEY) ?? "");
  }, []);

  React.useEffect(() => {
    if (doctorName.trim()) window.localStorage.setItem(DOCTOR_NAME_KEY, doctorName.trim());
    else window.localStorage.removeItem(DOCTOR_NAME_KEY);
  }, [doctorName]);

  React.useEffect(() => {
    if (!selectedAppointment) return;
    setPatientId(selectedAppointment.patient_uuid);
    const linked = selectedAppointment.encounter_uuid
      ? patientEncounters.data?.find((item) => item.uuid === selectedAppointment.encounter_uuid)
      : null;
    const key = linked ? `encounter:${linked.uuid}` : `appointment:${selectedAppointment.uuid}`;
    if (loadedContext.current === key) return;
    if (selectedAppointment.encounter_uuid && !linked && patientEncounters.isPending) return;
    loadedContext.current = key;
    if (linked) {
      loadEncounter(linked);
      return;
    }
    setEditingEncounterId("");
    setForm({
      ...emptyForm(),
      type: "appointment",
      occurredAt: toDateTimeLocal(selectedAppointment.starts_at),
      chiefComplaint: selectedAppointment.notes ?? "",
    });
  }, [loadEncounter, selectedAppointment, patientEncounters.data, patientEncounters.isPending]);

  React.useEffect(() => {
    if (byAppointment || !initialEncounterId || !patientEncounters.data) return;
    const encounter = patientEncounters.data.find((item) => item.uuid === initialEncounterId);
    if (!encounter || loadedContext.current === `encounter:${encounter.uuid}`) return;
    loadedContext.current = `encounter:${encounter.uuid}`;
    loadEncounter(encounter);
  }, [byAppointment, initialEncounterId, loadEncounter, patientEncounters.data]);

  function changeMode(next: boolean) {
    setByAppointment(next);
    setFormError(null);
    setContextQuery("");
    loadedContext.current = "";
    setEditingEncounterId("");
    setForm(emptyForm());
    setAppointmentId("");
    setPatientId("");
  }

  function selectPatient(nextPatientId: string) {
    setPatientId(nextPatientId);
    setEditingEncounterId("");
    loadedContext.current = `patient:${nextPatientId}`;
    setForm(emptyForm());
  }

  async function saveEncounter(finalize: boolean) {
    if (!patientId) {
      setFormError(byAppointment ? "Выберите запись" : "Выберите пациента");
      return;
    }
    if (byAppointment && !appointmentId) {
      setFormError("Выберите запись, по которой проводится приём");
      return;
    }
    setFormError(null);
    setPendingAction(finalize ? "complete" : "draft");
    const payload: EncounterWrite = {
      specialty: form.specialty,
      type: form.type,
      status: finalize || editingRecord?.status === "completed" ? "completed" : "draft",
      chief_complaint: form.chiefComplaint.trim() || null,
      anamnesis: form.anamnesis.trim() || null,
      anamnesis_data: {
        specialty: form.specialty,
        answers: editingRecord?.anamnesis_data?.answers ?? {},
        free_text: form.anamnesis.trim() || null,
      },
      exam: form.exam.trim() || null,
      plan: form.plan.trim() || null,
      diagnoses: form.diagnoses.split(",").map((item) => item.trim()).filter(Boolean),
      vas_score: form.vasScore,
      occurred_at: form.occurredAt ? fromDateTimeLocal(form.occurredAt) : new Date().toISOString(),
    };

    try {
      const saved = editingEncounterId
        ? await updateEncounter.mutateAsync({ id: editingEncounterId, body: payload })
        : await createEncounter.mutateAsync(payload);
      setEditingEncounterId(saved.uuid);
      loadedContext.current = `encounter:${saved.uuid}`;
      if (byAppointment && appointmentId) {
        await updateAppointment.mutateAsync({
          id: appointmentId,
          body: {
            encounter_uuid: saved.uuid,
            status: finalize ? "completed" : selectedAppointment?.status === "completed" ? "completed" : "scheduled",
          },
        });
      }
      toast.success(
        finalize
          ? byAppointment
            ? "Приём завершён и связан с записью"
            : "Приём завершён"
          : "Черновик приёма сохранён",
      );
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    } finally {
      setPendingAction(null);
    }
  }

  const templates = (templateQuery.data ?? []).filter((template) => template.specialty === form.specialty);
  const busy = createEncounter.isPending || updateEncounter.isPending || updateAppointment.isPending;
  const saveContext = byAppointment && selectedAppointment
    ? `${selectedPatient?.name ?? "Пациент"} · ${formatDateTime(selectedAppointment.starts_at)}`
    : `${selectedPatient?.name ?? "Пациент"} · без записи`;

  function openTemplateCreate(section: EncounterTemplateSection, body: string) {
    setEditingTemplate(null);
    setTemplateSection(section);
    setTemplateScope(doctorName.trim() ? "doctor" : "clinic");
    setTemplateTitle("");
    setTemplateBody(body);
    setTemplateDialogOpen(true);
  }

  function openTemplateEdit(template: EncounterTemplateRecord) {
    setEditingTemplate(template);
    setTemplateSection(template.section);
    setTemplateScope(template.scope === "doctor" ? "doctor" : "clinic");
    setTemplateTitle(template.title);
    setTemplateBody(template.body);
    setTemplateDialogOpen(true);
  }

  async function saveTemplate() {
    if (!templateTitle.trim() || !templateBody.trim()) {
      toast.error("Заполните название и текст шаблона");
      return;
    }
    if (templateScope === "doctor" && !doctorName.trim()) {
      toast.error("Укажите имя врача в шапке приёма");
      return;
    }
    const body = {
      scope: templateScope,
      section: templateSection,
      specialty: form.specialty,
      title: templateTitle.trim(),
      body: templateBody.trim(),
      doctor_name: templateScope === "doctor" ? doctorName.trim() : null,
    };
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({ id: editingTemplate.uuid, body });
        toast.success("Шаблон обновлён");
      } else {
        await createTemplate.mutateAsync(body);
        toast.success("Шаблон создан");
      }
      setTemplateDialogOpen(false);
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  async function removeTemplate(template: EncounterTemplateRecord) {
    if (!window.confirm(`Удалить шаблон «${template.title}»?`)) return;
    try {
      await deleteTemplate.mutateAsync(template.uuid);
      toast.success("Шаблон удалён");
    } catch (cause) {
      toast.error(apiErrorMessage(cause));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-3 sm:p-5 lg:p-7">
      <header className="overflow-hidden rounded-2xl bg-[oklch(0.24_0.035_175)] text-white shadow-[0_18px_48px_-32px_oklch(0.2_0.04_175/0.75)]">
        <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-emerald-200 ring-1 ring-white/10">
                <Stethoscope className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Клинический приём</h1>
                <p className="mt-1 text-sm text-emerald-50/70">Заполните ключевые разделы и завершите запись одним действием.</p>
              </div>
            </div>
          </div>
          <div className="hidden flex-wrap gap-2 sm:flex">
            {selectedPatient ? (
              <Button asChild variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/15">
                <Link href={`/patients/${selectedPatient.uuid}`}>
                  <UserRound className="h-4 w-4" /> Карточка пациента
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="secondary" size="sm" className="bg-white text-[oklch(0.24_0.035_175)] hover:bg-emerald-50" onClick={() => void saveEncounter(false)} disabled={busy}>
              {pendingAction === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Сохранить черновик
            </Button>
            <Button type="button" size="sm" className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300" onClick={() => void saveEncounter(true)} disabled={busy}>
              {pendingAction === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Завершить приём
            </Button>
          </div>
        </div>

        <div className="grid border-t border-white/10 bg-black/10 lg:grid-cols-[auto_minmax(18rem,1.35fr)_minmax(15rem,1fr)]">
          <div className="flex items-center gap-1 border-b border-white/10 p-3 lg:border-b-0 lg:border-r">
            <button type="button" onClick={() => changeMode(true)} aria-pressed={byAppointment} className={cn("rounded-lg px-3 py-2 text-xs font-semibold transition-colors", byAppointment ? "bg-white text-emerald-950" : "text-emerald-50/75 hover:bg-white/10")}>
              По записи
            </button>
            <button type="button" onClick={() => changeMode(false)} aria-pressed={!byAppointment} className={cn("rounded-lg px-3 py-2 text-xs font-semibold transition-colors", !byAppointment ? "bg-white text-emerald-950" : "text-emerald-50/75 hover:bg-white/10")}>
              Без записи
            </button>
          </div>
          <div className="border-b border-white/10 p-3 lg:border-b-0 lg:border-r">
            <Input
              value={contextQuery}
              onChange={(event) => setContextQuery(event.target.value)}
              placeholder={byAppointment ? "Найти запись" : "Найти пациента"}
              className="mb-2 border-white/15 bg-white/10 text-white placeholder:text-white/45"
              aria-label={byAppointment ? "Поиск записи" : "Поиск пациента"}
            />
            {byAppointment ? (
              <Select value={appointmentId} onValueChange={(value) => { loadedContext.current = ""; setAppointmentId(value); }}>
                <SelectTrigger aria-label="Запись на приём" className="border-white/15 bg-white/10 text-white [&_svg]:text-white/60">
                  <SelectValue placeholder="Выберите запись" />
                </SelectTrigger>
                <SelectContent>
                  {filteredAppointments.map((appointment) => (
                    <SelectItem key={appointment.uuid} value={appointment.uuid}>{appointmentLabel(appointment)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={patientId} onValueChange={selectPatient}>
                <SelectTrigger aria-label="Пациент" className="border-white/15 bg-white/10 text-white [&_svg]:text-white/60">
                  <SelectValue placeholder="Выберите пациента" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPatients.map((patient) => (
                    <SelectItem key={patient.uuid} value={patient.uuid}>{patient.name} · {patient.client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-2 p-3">
            <UserRound className="h-4 w-4 shrink-0 text-emerald-200" />
            <Input value={doctorName} onChange={(event) => setDoctorName(event.target.value)} placeholder="Имя врача для личных шаблонов" className="border-white/15 bg-white/10 text-white placeholder:text-white/45" aria-label="Имя врача" />
          </div>
        </div>
      </header>

      {formError ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{formError}</p> : null}

      {selectedPatient ? (
        <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{selectedPatient.name}</p>
              <p className="truncate text-xs text-muted-foreground">{speciesLabel(selectedPatient.species)} · {selectedPatient.breed || "порода не указана"} · {selectedPatient.client.name}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encounter-specialty">Специальность</Label>
            <Select value={form.specialty} onValueChange={(value) => setForm((current) => ({ ...current, specialty: value as EncounterSpecialty }))}>
              <SelectTrigger id="encounter-specialty"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(SPECIALTY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encounter-type">Тип приёма</Label>
            <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value as EncounterType }))}>
              <SelectTrigger id="encounter-type"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(ENCOUNTER_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="encounter-date">Дата и время</Label>
            <Input id="encounter-date" type="datetime-local" value={form.occurredAt} onChange={(event) => setForm((current) => ({ ...current, occurredAt: event.target.value }))} />
          </div>
        </div>
      ) : appointments.isPending || patients.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="rounded-2xl border border-dashed px-5 py-10 text-center">
          <CalendarCheck className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-3 font-medium">Выберите запись или пациента</p>
          <p className="mt-1 text-sm text-muted-foreground">После выбора откроются данные и редактор приёма.</p>
        </div>
      )}

      {selectedPatient ? (
        <>
          <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-2">
              <Label htmlFor="chief-complaint">Жалоба</Label>
              <Input id="chief-complaint" value={form.chiefComplaint} onChange={(event) => setForm((current) => ({ ...current, chiefComplaint: event.target.value }))} placeholder="Основная причина обращения" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>VAS зуда</Label><span className="text-sm font-semibold text-primary">{form.vasScore ?? "—"}</span></div>
              {form.vasScore == null ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, vasScore: 1 }))}>
                  Указать VAS
                </Button>
              ) : (
                <>
                  <Slider min={1} max={10} step={1} value={[form.vasScore]} onValueChange={([value]) => setForm((current) => ({ ...current, vasScore: value ?? 1 }))} aria-label="VAS зуда от 1 до 10" />
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm((current) => ({ ...current, vasScore: null }))}>Не указывать</button>
                </>
              )}
            </div>
          </section>

          {(["anamnesis", "exam", "plan"] as const).map((section) => (
            <SectionEditor
              key={section}
              section={section}
              value={form[section]}
              templates={templates.filter((template) => template.section === section)}
              pending={busy}
              onChange={(value) => setForm((current) => ({ ...current, [section]: value }))}
              onCreate={openTemplateCreate}
              onEdit={openTemplateEdit}
              onDelete={(template) => void removeTemplate(template)}
            />
          ))}

          <section className="rounded-2xl border bg-card p-4 sm:p-5">
            <Label htmlFor="encounter-diagnoses">Диагнозы</Label>
            <Input id="encounter-diagnoses" value={form.diagnoses} onChange={(event) => setForm((current) => ({ ...current, diagnoses: event.target.value }))} placeholder="Укажите диагнозы через запятую" className="mt-2" />
          </section>

          {templateQuery.isError ? <p className="text-sm text-destructive" role="alert">{apiErrorMessage(templateQuery.error)}</p> : null}
          <div className="sticky bottom-3 z-20 flex flex-col gap-2 rounded-2xl bg-[oklch(0.24_0.035_175)] p-3 shadow-[0_18px_48px_-26px_oklch(0.2_0.04_175/0.8)] sm:flex-row sm:items-center sm:justify-between">
            <p className="px-1 text-xs text-emerald-50/70">
              <span className="font-semibold text-white">{saveContext}</span>
              <span className="block">{editingEncounterId ? "Изменения будут сохранены в существующий приём" : "Будет создан новый приём"}</span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => void saveEncounter(false)} disabled={busy}>{pendingAction === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Черновик</Button>
              <Button type="button" className="flex-1 bg-emerald-400 text-emerald-950 hover:bg-emerald-300 sm:flex-none" onClick={() => void saveEncounter(true)} disabled={busy}>{pendingAction === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Завершить</Button>
            </div>
          </div>
        </>
      ) : null}

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Изменить шаблон" : "Новый шаблон"}</DialogTitle>
            <DialogDescription>Шаблон будет доступен в разделе «{SECTION_META[templateSection].title}» для специальности «{SPECIALTY_LABELS[form.specialty]}».</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Доступ</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setTemplateScope("clinic")} aria-pressed={templateScope === "clinic"} className={cn("rounded-xl border p-3 text-left text-sm transition-colors", templateScope === "clinic" ? "border-primary bg-primary/8" : "hover:bg-muted")}>
                  <span className="font-semibold">Шаблон клиники</span><span className="mt-1 block text-xs text-muted-foreground">Виден всем врачам инстанса</span>
                </button>
                <button type="button" onClick={() => setTemplateScope("doctor")} aria-pressed={templateScope === "doctor"} className={cn("rounded-xl border p-3 text-left text-sm transition-colors", templateScope === "doctor" ? "border-primary bg-primary/8" : "hover:bg-muted")}>
                  <span className="font-semibold">Шаблон врача</span><span className="mt-1 block text-xs text-muted-foreground">Только для {doctorName.trim() || "указанного врача"}</span>
                </button>
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="template-title">Название</Label><Input id="template-title" value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} placeholder="Например: Контрольный осмотр при атопии" /></div>
            <div className="space-y-2"><Label htmlFor="template-body">Текст шаблона</Label><Textarea id="template-body" value={templateBody} onChange={(event) => setTemplateBody(event.target.value)} className="min-h-52 leading-6" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>Отмена</Button>
            <Button type="button" onClick={() => void saveTemplate()} disabled={createTemplate.isPending || updateTemplate.isPending}>{createTemplate.isPending || updateTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editingTemplate ? "Сохранить" : "Создать шаблон"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
