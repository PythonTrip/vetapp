"use client";

import * as React from "react";
import {
  Activity, BookMarked, Check, CheckCircle2, ChevronRight,
  Clock3, FilePlus2, History, Loader2, Plus, Save, Sparkles, Stethoscope,
  Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useAddConsultation, useCreateCustomTemplate, useCustomTemplates, useUpdateConsultation,
} from "@/lib/hooks";
import { AnamnesisForm, type AnamnesisAnswers } from "@/components/crm/anamnesis-form";
import { buildAnamnesisSummary, parseAnamnesisData } from "@/lib/anamnesis-schema";
import { TREATMENT_TEMPLATES, type TreatmentTemplate } from "@/lib/treatment-templates";
import type {
  Consultation, ConsultationSpecialty, ConsultationStatus, CustomTemplate,
  PetWithRelations, PrescriptionItem,
} from "@/lib/types";
import { toast } from "sonner";

type TemplateSections = {
  anamnesis?: string;
  anamnesisAnswers?: AnamnesisAnswers;
  anamnesisFreeText?: string;
  physicalExam?: string;
  diagnoses?: string[];
  prescriptions?: PrescriptionItem[];
  followUpPlan?: string;
};

type WorkspaceTemplate = TreatmentTemplate & {
  templateKey: string;
  version: number;
  sections?: string;
  isCustom?: boolean;
};

const STATUS_STEPS: Array<{ id: Exclude<ConsultationStatus, "cancelled">; label: string }> = [
  { id: "draft", label: "Черновик" },
  { id: "in_progress", label: "Идёт приём" },
  { id: "completed", label: "Завершён" },
];

const EMPTY_PRESCRIPTION = (): PrescriptionItem => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
});

function safeArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSoap(notes: string): TemplateSections {
  const sections: TemplateSections = {};
  for (const line of notes.split("\n")) {
    const value = line.slice(2).trim();
    if (line.startsWith("S:")) sections.anamnesis = [sections.anamnesis, value].filter(Boolean).join("\n");
    if (line.startsWith("O:")) sections.physicalExam = [sections.physicalExam, value].filter(Boolean).join("\n");
    if (line.startsWith("A:")) sections.diagnoses = value ? [value] : [];
    if (line.startsWith("P:")) {
      const planItems = value.split(/\.\s+/).map((item) => item.trim()).filter(Boolean);
      sections.prescriptions = planItems.map((name, index) => ({
        id: `template-${index}`,
        name: name.replace(/\.$/, ""),
        dosage: "",
        frequency: "",
        duration: "",
        instructions: "",
      }));
      sections.followUpPlan = planItems.find((item) => /recheck|контрол/i.test(item)) ?? "";
    }
  }
  return sections;
}

function customToWorkspace(template: CustomTemplate): WorkspaceTemplate {
  return {
    id: template.id,
    templateKey: template.templateKey ?? template.id,
    version: template.version,
    name: template.name,
    category: template.category as TreatmentTemplate["category"],
    description: template.description ?? "Пользовательский шаблон",
    icon: template.icon,
    type: template.type,
    chiefComplaint: template.chiefComplaint ?? "",
    notes: template.notes,
    suggestedVas: template.suggestedVas ?? undefined,
    duration: template.duration ?? undefined,
    sections: template.sections ?? undefined,
    isCustom: true,
  };
}

export function ConsultationWorkspace({ pet, onEditPet }: { pet: PetWithRelations; onEditPet?: () => void }) {
  const addConsultation = useAddConsultation();
  const updateConsultation = useUpdateConsultation();
  const createTemplate = useCreateCustomTemplate();
  const { data: customTemplates } = useCustomTemplates();

  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<ConsultationStatus>("draft");
  const [specialty, setSpecialty] = React.useState<ConsultationSpecialty>("dermatology");
  const [chiefComplaint, setChiefComplaint] = React.useState("");
  const [anamnesisAnswers, setAnamnesisAnswers] = React.useState<AnamnesisAnswers>({});
  const [anamnesisFreeText, setAnamnesisFreeText] = React.useState("");
  const [physicalExam, setPhysicalExam] = React.useState("");
  const [diagnoses, setDiagnoses] = React.useState<string[]>([]);
  const [diagnosisInput, setDiagnosisInput] = React.useState("");
  const [prescriptions, setPrescriptions] = React.useState<PrescriptionItem[]>([]);
  const [followUpPlan, setFollowUpPlan] = React.useState("");
  const [followUpDate, setFollowUpDate] = React.useState("");
  const [weight, setWeight] = React.useState("");
  const [vasScore, setVasScore] = React.useState("");
  const [templateMeta, setTemplateMeta] = React.useState<{ key: string; name: string; version: number } | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false);
  const [templateName, setTemplateName] = React.useState("");
  const [templateSearch, setTemplateSearch] = React.useState("");

  const hydratedPetRef = React.useRef<string | null>(null);

  const templates = React.useMemo<WorkspaceTemplate[]>(() => {
    const builtIns = TREATMENT_TEMPLATES
      .filter((template) => template.category === "dermatology" || template.category === "nutrition")
      .map((template) => ({
        ...template,
        templateKey: template.templateKey ?? template.id,
        version: template.version ?? 1,
      }));
    const custom = (customTemplates ?? [])
      .filter((template) => template.category === "dermatology" || template.category === "nutrition")
      .map(customToWorkspace);
    return [...custom, ...builtIns];
  }, [customTemplates]);

  const visibleTemplates = templates.filter((template) => {
    const query = templateSearch.trim().toLowerCase();
    return template.category === specialty && (!query || `${template.name} ${template.description}`.toLowerCase().includes(query));
  });

  function hydrate(consultation: Consultation) {
    setCurrentId(consultation.id);
    setStatus(consultation.status ?? "draft");
    setSpecialty(consultation.specialty ?? "general");
    setChiefComplaint(consultation.chiefComplaint ?? "");
    const parsedAnamnesis = parseAnamnesisData(consultation.anamnesisData);
    if (parsedAnamnesis) {
      setAnamnesisAnswers(parsedAnamnesis.answers);
      setAnamnesisFreeText(parsedAnamnesis.freeText ?? "");
    } else {
      setAnamnesisAnswers({});
      setAnamnesisFreeText(consultation.anamnesis ?? "");
    }
    setPhysicalExam(consultation.physicalExam ?? "");
    setDiagnoses(safeArray<string>(consultation.diagnoses));
    setPrescriptions(safeArray<PrescriptionItem>(consultation.prescriptions));
    setFollowUpPlan(consultation.followUpPlan ?? "");
    setFollowUpDate(consultation.followUpDate?.slice(0, 10) ?? "");
    setWeight(consultation.weight == null ? "" : String(consultation.weight));
    setVasScore(consultation.vasScore == null ? "" : String(consultation.vasScore));
    setTemplateMeta(consultation.templateKey ? {
      key: consultation.templateKey,
      name: consultation.templateName ?? "Шаблон",
      version: consultation.templateVersion ?? 1,
    } : null);
  }

  const resetForm = React.useCallback(() => {
    setCurrentId(null);
    setStatus("draft");
    setSpecialty("dermatology");
    setChiefComplaint("");
    setAnamnesisAnswers({});
    setAnamnesisFreeText("");
    setPhysicalExam("");
    setDiagnoses([]);
    setDiagnosisInput("");
    setPrescriptions([]);
    setFollowUpPlan("");
    setFollowUpDate("");
    setWeight("");
    setVasScore("");
    setTemplateMeta(null);
  }, []);

  React.useEffect(() => {
    if (hydratedPetRef.current === pet.id) return;
    hydratedPetRef.current = pet.id;
    const openConsultation = [...pet.consultations]
      .filter((consultation) => consultation.status === "draft" || consultation.status === "in_progress")
      .sort((a, b) => new Date(b.updatedAt ?? b.date).getTime() - new Date(a.updatedAt ?? a.date).getTime())[0];
    if (openConsultation) hydrate(openConsultation);
    else resetForm();
  }, [pet.id, resetForm]);

  function addDiagnosis() {
    const value = diagnosisInput.trim();
    if (!value || diagnoses.includes(value)) return;
    setDiagnoses((items) => [...items, value]);
    setDiagnosisInput("");
  }

  const anamnesisText = buildAnamnesisSummary(pet, specialty, anamnesisAnswers, anamnesisFreeText);
  const anamnesisFilled = Object.keys(anamnesisAnswers).length > 0 || anamnesisFreeText.trim().length > 0;

  function buildNotes() {
    return [
      anamnesisText && `S: ${anamnesisText}`,
      physicalExam && `O: ${physicalExam}`,
      diagnoses.length > 0 && `A: ${diagnoses.join("; ")}`,
      prescriptions.length > 0 && `P: ${prescriptions.map((item) => [item.name, item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")).join("; ")}`,
      followUpPlan && `Контроль: ${followUpPlan}`,
    ].filter(Boolean).join("\n");
  }

  function payload(nextStatus: ConsultationStatus) {
    return {
      date: new Date().toISOString(),
      type: "appointment",
      status: nextStatus,
      specialty,
      chiefComplaint: chiefComplaint.trim() || null,
      anamnesis: anamnesisFilled ? anamnesisText : null,
      anamnesisData: anamnesisFilled
        ? { specialty, answers: anamnesisAnswers, freeText: anamnesisFreeText.trim() || undefined }
        : null,
      physicalExam: physicalExam.trim() || null,
      diagnoses,
      prescriptions: prescriptions.filter((item) => item.name.trim()),
      followUpPlan: followUpPlan.trim() || null,
      followUpDate: followUpDate || null,
      weight: weight ? Number(weight) : null,
      vasScore: vasScore ? Number(vasScore) : null,
      notes: buildNotes() || "Приём без клинических записей",
      templateKey: templateMeta?.key ?? null,
      templateName: templateMeta?.name ?? null,
      templateVersion: templateMeta?.version ?? null,
    };
  }

  async function save(nextStatus: ConsultationStatus, quiet = false) {
    if (nextStatus === "completed" && !anamnesisFilled) {
      toast.error("Заполните анамнез перед завершением приёма");
      return;
    }
    try {
      if (currentId) {
        await updateConsultation.mutateAsync({ id: currentId, data: payload(nextStatus) });
      } else {
        const created = await addConsultation.mutateAsync({ petId: pet.id, data: payload(nextStatus) });
        setCurrentId(created.id);
      }
      setStatus(nextStatus);
      if (!quiet) {
        toast.success(nextStatus === "completed" ? "Приём завершён и сохранён" : nextStatus === "in_progress" ? "Приём начат" : "Черновик сохранён");
      }
    } catch {
      toast.error("Не удалось сохранить приём");
    }
  }

  function applyTemplate(template: WorkspaceTemplate) {
    let sections: TemplateSections = {};
    if (template.sections) {
      try { sections = JSON.parse(template.sections); } catch { sections = parseSoap(template.notes); }
    } else {
      sections = parseSoap(template.notes);
    }
    setChiefComplaint(template.chiefComplaint);
    setAnamnesisAnswers(sections.anamnesisAnswers ?? {});
    setAnamnesisFreeText(sections.anamnesisFreeText ?? sections.anamnesis ?? "");
    setPhysicalExam(sections.physicalExam ?? "");
    setDiagnoses(sections.diagnoses ?? []);
    setPrescriptions((sections.prescriptions ?? []).map((item) => ({ ...item, id: EMPTY_PRESCRIPTION().id })));
    setFollowUpPlan(sections.followUpPlan ?? "");
    if (template.suggestedVas != null) setVasScore(String(template.suggestedVas));
    setTemplateMeta({ key: template.templateKey, name: template.name, version: template.version });
    toast.success(`Применён шаблон «${template.name}»`, { description: `Версия ${template.version} зафиксируется в приёме.` });
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) {
      toast.error("Укажите название шаблона");
      return;
    }
    const sections: TemplateSections = {
      anamnesisAnswers, anamnesisFreeText, physicalExam, diagnoses, prescriptions, followUpPlan,
    };
    try {
      const created = await createTemplate.mutateAsync({
        name: templateName.trim(),
        category: specialty === "general" ? "dermatology" : specialty,
        description: chiefComplaint || "Шаблон карточки приёма",
        icon: specialty === "nutrition" ? "Apple" : "Stethoscope",
        type: "appointment",
        chiefComplaint: chiefComplaint || null,
        notes: buildNotes(),
        suggestedVas: vasScore ? Number(vasScore) : null,
        sections,
      });
      setTemplateMeta({ key: created.templateKey, name: created.name, version: created.version });
      setTemplateDialogOpen(false);
      setTemplateName("");
      toast.success("Шаблон создан", { description: "Это версия 1; дальнейшие изменения сохранятся как новые версии." });
    } catch {
      toast.error("Не удалось создать шаблон");
    }
  }

  const isSaving = addConsultation.isPending || updateConsultation.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-col gap-4 border-b bg-gradient-to-r from-primary/10 via-emerald-500/5 to-transparent p-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-bold">Рабочая карточка приёма</h2>
                <p className="text-xs text-muted-foreground">Главный сценарий: заполните анамнез, зафиксируйте решения и контроль.</p>
              </div>
              {currentId && <Badge variant="outline" className="bg-background/80">№ {currentId.slice(-6)}</Badge>}
              {templateMeta && <Badge className="gap-1 bg-violet-500/10 text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"><BookMarked className="h-3 w-3" /> {templateMeta.name} · v{templateMeta.version}</Badge>}
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {STATUS_STEPS.map((step, index) => {
              const activeIndex = STATUS_STEPS.findIndex((item) => item.id === status);
              const isReached = index <= activeIndex;
              return (
                <React.Fragment key={step.id}>
                  {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
                  <div className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap", isReached ? "border-primary/30 bg-primary/10 text-primary" : "bg-background/60 text-muted-foreground")}>
                    <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[9px]", isReached ? "bg-primary text-primary-foreground" : "bg-muted")}>{index < activeIndex ? <Check className="h-2.5 w-2.5" /> : index + 1}</span>
                    {step.label}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-4 sm:p-5 space-y-5 min-w-0">
            <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_120px_110px]">
              <div className="space-y-1.5">
                <Label>Направление</Label>
                <Select value={specialty} onValueChange={(value) => setSpecialty(value as ConsultationSpecialty)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dermatology">Дерматология</SelectItem>
                    <SelectItem value="nutrition">Диетология</SelectItem>
                    <SelectItem value="general">Общий приём</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Вес, кг</Label>
                <Input type="number" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder={String(pet.currentWeight)} />
              </div>
              <div className="space-y-1.5">
                <Label>Зуд VAS</Label>
                <Input type="number" min="0" max="10" value={vasScore} onChange={(event) => setVasScore(event.target.value)} placeholder="0–10" />
              </div>
            </div>

            <AnamnesisForm
              pet={pet}
              specialty={specialty}
              answers={anamnesisAnswers}
              onAnswersChange={setAnamnesisAnswers}
              chiefComplaint={chiefComplaint}
              onChiefComplaintChange={setChiefComplaint}
              freeText={anamnesisFreeText}
              onFreeTextChange={setAnamnesisFreeText}
              onEditPet={onEditPet}
              excludeConsultationId={currentId}
            />

            <section className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Осмотр и объективные данные</Label>
              <Textarea value={physicalExam} onChange={(event) => setPhysicalExam(event.target.value)} rows={5} placeholder="Общее состояние, локальный статус, результаты осмотра и исследований…" />
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <StructuredCard title="Диагнозы" subtitle="Предварительные и подтверждённые" icon={Stethoscope}>
                <div className="flex gap-2">
                  <Input value={diagnosisInput} onChange={(event) => setDiagnosisInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addDiagnosis(); } }} placeholder="Добавить диагноз" />
                  <Button type="button" variant="outline" size="icon" onClick={addDiagnosis}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-8">
                  {diagnoses.map((diagnosis) => (
                    <Badge key={diagnosis} variant="secondary" className="items-start justify-start gap-1 py-1 pl-2.5 pr-1 text-left leading-snug">
                      <span className="min-w-0">{diagnosis}</span>
                      <button
                        type="button"
                        aria-label={`Удалить диагноз «${diagnosis}»`}
                        onClick={() => setDiagnoses((items) => items.filter((item) => item !== diagnosis))}
                        className="mt-px shrink-0 rounded-full p-0.5 hover:bg-background"
                      ><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  {diagnoses.length === 0 && <p className="text-xs text-muted-foreground py-1">Диагнозы пока не добавлены</p>}
                </div>
              </StructuredCard>

              <StructuredCard title="Контрольный план" subtitle="Что отслеживать и когда связаться" icon={Clock3}>
                <Textarea value={followUpPlan} onChange={(event) => setFollowUpPlan(event.target.value)} rows={3} placeholder="Критерии эффективности, домашний мониторинг, анализы, повторный приём…" />
                <div className="space-y-1">
                  <Label className="text-xs">Дата контроля</Label>
                  <Input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
                </div>
              </StructuredCard>
            </div>

            <StructuredCard title="Назначения" subtitle="Препараты, рацион и рекомендации сохраняются отдельным списком" icon={FilePlus2}>
              <div className="space-y-2">
                {prescriptions.map((item, index) => (
                  <div key={item.id} className="grid gap-2 rounded-xl border bg-muted/20 p-2.5 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
                    <Input value={item.name} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, name: event.target.value } : current))} placeholder={index === 0 ? "Препарат / рацион / рекомендация" : "Название"} />
                    <Input value={item.dosage} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, dosage: event.target.value } : current))} placeholder="Дозировка" />
                    <Input value={item.frequency} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, frequency: event.target.value } : current))} placeholder="Кратность" />
                    <Input value={item.duration} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, duration: event.target.value } : current))} placeholder="Курс" />
                    <Button variant="ghost" size="icon" onClick={() => setPrescriptions((items) => items.filter((current) => current.id !== item.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPrescriptions((items) => [...items, EMPTY_PRESCRIPTION()])}><Plus className="h-3.5 w-3.5" /> Добавить назначение</Button>
              </div>
            </StructuredCard>
          </div>

          <aside className="border-t bg-muted/20 p-4 2xl:border-l 2xl:border-t-0">
            <div className="sticky top-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Шаблоны приёма</h3>
                  <p className="text-[11px] text-muted-foreground">Дерматология и диетология</p>
                </div>
                <Badge variant="outline">{visibleTemplates.length}</Badge>
              </div>
              <Input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Поиск шаблона…" className="h-8 text-xs" />
              <div className="max-h-[510px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {visibleTemplates.map((template) => (
                  <button key={`${template.templateKey}-${template.version}`} onClick={() => applyTemplate(template)} className={cn("w-full rounded-xl border bg-background p-3 text-left transition hover:border-primary/50 hover:shadow-sm", templateMeta?.key === template.templateKey && "border-primary bg-primary/5")}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold leading-4">{template.name}</span>
                      <Badge variant="outline" className="shrink-0 text-[9px]">v{template.version}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{template.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="secondary" className="text-[9px]">{template.isCustom ? "Мой шаблон" : "Системный"}</Badge>
                      <span className="text-[10px] font-medium text-primary">Применить →</span>
                    </div>
                  </button>
                ))}
                {visibleTemplates.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Нет шаблонов для выбранного направления.</div>}
              </div>
              <Button variant="outline" className="w-full gap-1.5" onClick={() => { setTemplateName(chiefComplaint || ""); setTemplateDialogOpen(true); }}><BookMarked className="h-4 w-4" /> Создать из карточки</Button>
            </div>
          </aside>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {currentId ? <><History className="h-3.5 w-3.5" /> Все изменения сохраняются в текущий приём</> : <><FilePlus2 className="h-3.5 w-3.5" /> Новый приём ещё не сохранён</>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}>Новый приём</Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={isSaving} onClick={() => save("draft")}><Save className="h-3.5 w-3.5" /> Сохранить черновик</Button>
            {status === "draft" && <Button variant="secondary" size="sm" className="gap-1.5" disabled={isSaving} onClick={() => save("in_progress")}><Stethoscope className="h-3.5 w-3.5" /> Начать приём</Button>}
            <Button size="sm" className="gap-1.5" disabled={isSaving || status === "completed"} onClick={() => save("completed")}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Завершить и сохранить
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Создать шаблон из приёма</DialogTitle>
            <DialogDescription>Текущие секции карточки сохранятся как версия 1. При редактировании будет создана следующая версия.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Название шаблона</Label>
            <Input autoFocus value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Например, первичный приём при атопии" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTemplateDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveAsTemplate} disabled={createTemplate.isPending} className="gap-1.5">{createTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />} Создать шаблон</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StructuredCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {title}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0">{children}</CardContent>
    </Card>
  );
}
