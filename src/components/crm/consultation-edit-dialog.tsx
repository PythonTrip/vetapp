"use client";

import * as React from "react";
import { Activity, Clock3, FilePlus2, Loader2, Pencil, Plus, Save, Stethoscope, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUpdateConsultation } from "@/lib/hooks";
import { AnamnesisForm, type AnamnesisAnswers } from "@/components/crm/anamnesis-form";
import { buildAnamnesisSummary, parseAnamnesisData } from "@/lib/anamnesis-schema";
import type {
  Consultation, ConsultationSpecialty, ConsultationStatus, ConsultationType,
  PetWithRelations, PrescriptionItem,
} from "@/lib/types";
import { toast } from "sonner";

function safeArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ConsultationEditDialog({
  pet, consultation, open, onOpenChange,
}: {
  pet: PetWithRelations;
  consultation: Consultation | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const updateConsultation = useUpdateConsultation();

  const [date, setDate] = React.useState("");
  const [type, setType] = React.useState<ConsultationType>("appointment");
  const [status, setStatus] = React.useState<ConsultationStatus>("completed");
  const [specialty, setSpecialty] = React.useState<ConsultationSpecialty>("general");
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

  React.useEffect(() => {
    if (!consultation || !open) return;
    setDate(consultation.date.slice(0, 10));
    setType(consultation.type ?? "appointment");
    setStatus(consultation.status ?? "completed");
    setSpecialty(consultation.specialty ?? "general");
    setChiefComplaint(consultation.chiefComplaint ?? "");
    const parsed = parseAnamnesisData(consultation.anamnesisData);
    if (parsed) {
      setAnamnesisAnswers(parsed.answers);
      setAnamnesisFreeText(parsed.freeText ?? "");
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
  }, [consultation, open]);

  if (!consultation) return null;

  const anamnesisFilled = Object.keys(anamnesisAnswers).length > 0 || anamnesisFreeText.trim().length > 0;
  const anamnesisText = buildAnamnesisSummary(pet, specialty, anamnesisAnswers, anamnesisFreeText);

  function addDiagnosis() {
    const value = diagnosisInput.trim();
    if (!value || diagnoses.includes(value)) return;
    setDiagnoses((items) => [...items, value]);
    setDiagnosisInput("");
  }

  function buildNotes() {
    return [
      anamnesisFilled && `S: ${anamnesisText}`,
      physicalExam.trim() && `O: ${physicalExam.trim()}`,
      diagnoses.length > 0 && `A: ${diagnoses.join("; ")}`,
      prescriptions.length > 0 && `P: ${prescriptions.map((item) => [item.name, item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")).join("; ")}`,
      followUpPlan.trim() && `Контроль: ${followUpPlan.trim()}`,
    ].filter(Boolean).join("\n");
  }

  async function handleSave() {
    if (!consultation) return;
    try {
      await updateConsultation.mutateAsync({
        id: consultation.id,
        data: {
          date: date ? new Date(date).toISOString() : consultation.date,
          type,
          status,
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
          notes: buildNotes() || consultation.notes,
        },
      });
      toast.success("Запись обновлена");
      onOpenChange(false);
    } catch {
      toast.error("Не удалось сохранить изменения");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Редактирование записи
          </DialogTitle>
          <DialogDescription>
            Приём от {new Date(consultation.date).toLocaleDateString("ru-RU")} — измените анамнез и клинические секции.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Дата</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Тип</Label>
              <Select value={type} onValueChange={(value) => setType(value as ConsultationType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">Приём</SelectItem>
                  <SelectItem value="diagnostic">Диагностика</SelectItem>
                  <SelectItem value="treatment">Лечение</SelectItem>
                  <SelectItem value="note">Заметка</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Направление</Label>
              <Select value={specialty} onValueChange={(value) => setSpecialty(value as ConsultationSpecialty)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dermatology">Дерматология</SelectItem>
                  <SelectItem value="nutrition">Диетология</SelectItem>
                  <SelectItem value="general">Общий</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Статус</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as ConsultationStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Черновик</SelectItem>
                  <SelectItem value="in_progress">Идёт приём</SelectItem>
                  <SelectItem value="completed">Завершён</SelectItem>
                  <SelectItem value="cancelled">Отменён</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Вес, кг</Label>
              <Input type="number" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Зуд VAS</Label>
              <Input type="number" min="0" max="10" value={vasScore} onChange={(event) => setVasScore(event.target.value)} />
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
            excludeConsultationId={consultation.id}
          />

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" /> Осмотр и объективные данные
            </Label>
            <Textarea value={physicalExam} onChange={(event) => setPhysicalExam(event.target.value)} rows={4} placeholder="Общее состояние, локальный статус, результаты осмотра…" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5 text-primary" /> Диагнозы
            </Label>
            <div className="flex gap-2">
              <Input
                value={diagnosisInput}
                onChange={(event) => setDiagnosisInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addDiagnosis(); } }}
                placeholder="Добавить диагноз"
              />
              <Button type="button" variant="outline" size="icon" onClick={addDiagnosis}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-7">
              {diagnoses.map((diagnosis) => (
                <Badge key={diagnosis} variant="secondary" className="items-start justify-start gap-1 py-1 pl-2.5 pr-1 text-left leading-snug">
                  <span className="min-w-0">{diagnosis}</span>
                  <button
                    type="button"
                    aria-label={`Удалить диагноз «${diagnosis}»`}
                    onClick={() => setDiagnoses((items) => items.filter((item) => item !== diagnosis))}
                    className="mt-px shrink-0 rounded-full p-0.5 hover:bg-background"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {diagnoses.length === 0 && <p className="text-xs text-muted-foreground py-1">Диагнозы не добавлены</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <FilePlus2 className="h-3.5 w-3.5 text-primary" /> Назначения
            </Label>
            <div className="space-y-2">
              {prescriptions.map((item, index) => (
                <div key={item.id} className="grid gap-2 rounded-xl border bg-muted/20 p-2.5 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
                  <Input value={item.name} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, name: event.target.value } : current))} placeholder={index === 0 ? "Препарат / рацион / рекомендация" : "Название"} />
                  <Input value={item.dosage} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, dosage: event.target.value } : current))} placeholder="Дозировка" />
                  <Input value={item.frequency} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, frequency: event.target.value } : current))} placeholder="Кратность" />
                  <Input value={item.duration} onChange={(event) => setPrescriptions((items) => items.map((current) => current.id === item.id ? { ...current, duration: event.target.value } : current))} placeholder="Курс" />
                  <Button variant="ghost" size="icon" onClick={() => setPrescriptions((items) => items.filter((current) => current.id !== item.id))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setPrescriptions((items) => [...items, {
                  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                  name: "", dosage: "", frequency: "", duration: "", instructions: "",
                }])}
              >
                <Plus className="h-3.5 w-3.5" /> Добавить назначение
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5 text-primary" /> Контрольный план
              </Label>
              <Textarea value={followUpPlan} onChange={(event) => setFollowUpPlan(event.target.value)} rows={2} placeholder="Критерии эффективности, мониторинг, повторный приём…" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Дата контроля</Label>
              <Input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSave} disabled={updateConsultation.isPending} className="gap-1.5">
            {updateConsultation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить изменения
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
