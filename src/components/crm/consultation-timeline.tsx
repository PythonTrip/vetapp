"use client";

import * as React from "react";
import {
  Plus, Stethoscope, FlaskConical, Pill, NotebookPen, Trash2, Calendar,
  Zap, Syringe, Microscope, HeartPulse, ClipboardList, Sparkles,
  CheckCircle2, Clock3, ChevronDown, Pencil, Activity, FilePlus2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddConsultation, useDeleteConsultation } from "@/lib/hooks";
import type { Consultation, PetWithRelations, ConsultationType, PrescriptionItem } from "@/lib/types";
import { vasDescription } from "@/lib/nutrition";
import { toast } from "sonner";
import { TreatmentTemplateDialog, templateToConsultationData } from "@/components/crm/treatment-templates";
import type { TreatmentTemplate } from "@/lib/treatment-templates";
import { ConsultationEditDialog } from "@/components/crm/consultation-edit-dialog";
import { getAnamnesisFields, parseAnamnesisData } from "@/lib/anamnesis-schema";
import { cn } from "@/lib/utils";

const TYPE_META: Record<ConsultationType, { label: string; icon: React.ElementType; color: string }> = {
  appointment: { label: "Appointment", icon: Stethoscope, color: "bg-primary/10 text-primary" },
  diagnostic: { label: "Diagnostic", icon: FlaskConical, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  treatment: { label: "Treatment", icon: Pill, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  note: { label: "Note", icon: NotebookPen, color: "bg-muted text-muted-foreground" },
};

// Quick-templates for common consultation types
const QUICK_TEMPLATES: {
  id: string;
  label: string;
  icon: React.ElementType;
  type: ConsultationType;
  chiefComplaint: string;
  notes: string;
  vas?: number;
}[] = [
  {
    id: "recheck",
    label: "Recheck Visit",
    icon: HeartPulse,
    type: "appointment",
    chiefComplaint: "Routine recheck",
    notes: "Patient rechecked. Owner reports improvement with current treatment plan. Continue current medications and diet. Recheck in 4 weeks.",
  },
  {
    id: "skin-scrape",
    label: "Skin Scrape",
    icon: Microscope,
    type: "diagnostic",
    chiefComplaint: "Skin scrape & cytology",
    notes: "Performed deep skin scrapings from affected areas. Cytology examined under oil immersion. Results pending — will relay to owner within 24h.",
  },
  {
    id: "allergy-injection",
    label: "Allergy Shot",
    icon: Syringe,
    type: "treatment",
    chiefComplaint: "Allergen-specific immunotherapy injection",
    notes: "Administered ASIT injection per protocol. No immediate adverse reaction. Owner instructed to monitor for 30 minutes post-injection. Next dose in 14 days.",
  },
  {
    id: "diet-consult",
    label: "Diet Consult",
    icon: ClipboardList,
    type: "appointment",
    chiefComplaint: "Nutrition consultation",
    notes: "Discussed current diet, caloric needs, and feeding schedule. Calculated RER/MER. Recommended transition to new diet over 7 days. Provided owner with written feeding guidelines.",
  },
  {
    id: "follow-up-phone",
    label: "Phone Follow-up",
    icon: NotebookPen,
    type: "note",
    chiefComplaint: "Phone follow-up",
    notes: "Spoke with owner by phone. Patient is doing well at home. No new concerns reported. Owner compliant with medications and diet. Next in-person visit scheduled.",
  },
];

export function ConsultationTimeline({ pet }: { pet: PetWithRelations }) {
  const [open, setOpen] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Consultation | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const addMut = useAddConsultation();
  const delMut = useDeleteConsultation();

  const entries = [...pet.consultations].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  async function applyTemplate(template: TreatmentTemplate) {
    try {
      await addMut.mutateAsync({
        petId: pet.id,
        data: {
          date: new Date().toISOString(),
          ...templateToConsultationData(template),
        },
      });
      toast.success(`Applied: ${template.name}`, {
        description: "Added to timeline. Edit the entry to customize.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply template");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Consultation Timeline</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{entries.length} entries · chronological</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTemplateOpen(true)}>
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Templates
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Entry
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 mx-auto mb-3">
              <Stethoscope className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground">No consultations yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Start the timeline with a clinical template or add a structured entry manually.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTemplateOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Browse Templates
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Entry
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
            {entries.map((c) => {
              const meta = TYPE_META[c.type as ConsultationType] ?? TYPE_META.note;
              const vas = c.vasScore != null ? vasDescription(c.vasScore) : null;
              const isExpanded = expandedId === c.id;
              return (
                <div key={c.id} className="relative pl-10 group">
                  <div className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full ${meta.color} ring-4 ring-background`}>
                    <meta.icon className="h-4 w-4" />
                  </div>
                  <div className="rounded-xl border p-3 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(c.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {c.weight != null && (
                          <Badge variant="secondary" className="text-[10px]">{c.weight} kg</Badge>
                        )}
                        {vas && (
                          <Badge variant="secondary" className={`text-[10px] ${vas.color}`}>VAS {c.vasScore}</Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={c.status === "completed" ? "text-[10px] gap-1 text-emerald-700 dark:text-emerald-400" : "text-[10px] gap-1 text-amber-700 dark:text-amber-400"}
                        >
                          {c.status === "completed" ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock3 className="h-2.5 w-2.5" />}
                          {c.status === "completed" ? "Завершён" : c.status === "in_progress" ? "Идёт приём" : "Черновик"}
                        </Badge>
                        {c.templateName && (
                          <Badge variant="outline" className="text-[10px]">
                            {c.templateName} · v{c.templateVersion ?? 1}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                          title="Редактировать запись"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          title="Удалить запись"
                          onClick={() => {
                            delMut.mutate(c.id, {
                              onSuccess: () => toast.success("Запись удалена"),
                              onError: () => toast.error("Не удалось удалить"),
                            });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {c.chiefComplaint && (
                      <p className="text-sm font-semibold mt-1.5">{c.chiefComplaint}</p>
                    )}
                    {isExpanded ? (
                      <ConsultationDetail consultation={c} />
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap line-clamp-3">{c.notes}</p>
                    )}
                    {c.followUpDate && (
                      <p className="mt-2 text-xs font-medium text-primary">
                        Контроль: {new Date(c.followUpDate).toLocaleDateString()}{c.followUpPlan ? ` · ${c.followUpPlan}` : ""}
                      </p>
                    )}
                    {c.transcript && isExpanded && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-muted-foreground/70 cursor-pointer hover:text-muted-foreground">
                          Исходная транскрипция
                        </summary>
                        <p className="text-[11px] text-muted-foreground/70 mt-1 italic whitespace-pre-wrap">{c.transcript}</p>
                      </details>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                      {isExpanded ? "Свернуть" : "Подробнее"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AddConsultationDialog
        open={open}
        onOpenChange={setOpen}
        petId={pet.id}
        onAdd={addMut}
      />
      <TreatmentTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onApply={applyTemplate}
      />
      <ConsultationEditDialog
        pet={pet}
        consultation={editing}
        open={!!editing}
        onOpenChange={(value) => !value && setEditing(null)}
      />
    </Card>
  );
}

function safeParseArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Развёрнутый структурированный просмотр записи истории
function ConsultationDetail({ consultation }: { consultation: Consultation }) {
  const anamnesisData = parseAnamnesisData(consultation.anamnesisData);
  const diagnoses = safeParseArray<string>(consultation.diagnoses);
  const prescriptions = safeParseArray<PrescriptionItem>(consultation.prescriptions).filter((p) => p?.name);
  const fields = anamnesisData ? getAnamnesisFields(anamnesisData.specialty) : [];

  const answeredFields = fields
    .map((field) => {
      const value = anamnesisData?.answers[field.id];
      if (value == null) return null;
      if (Array.isArray(value)) return value.length > 0 ? { label: field.label, value: value.join(", ") } : null;
      if (field.type === "toggle") return value === "yes" ? { label: field.label, value: "Да" } : null;
      return String(value).trim() ? { label: field.label, value: String(value) } : null;
    })
    .filter((item): item is { label: string; value: string } => item !== null);

  const hasStructure = answeredFields.length > 0 || consultation.anamnesis || consultation.physicalExam ||
    diagnoses.length > 0 || prescriptions.length > 0;

  if (!hasStructure) {
    return <p className="text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">{consultation.notes}</p>;
  }

  return (
    <div className="mt-2 space-y-3">
      {(answeredFields.length > 0 || anamnesisData?.freeText || consultation.anamnesis) && (
        <DetailSection icon={ClipboardList} title="Анамнез">
          {answeredFields.length > 0 ? (
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {answeredFields.map((item) => (
                <div key={item.label} className="text-xs">
                  <span className="text-muted-foreground">{item.label}: </span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
              {anamnesisData?.freeText && (
                <p className="sm:col-span-2 text-xs whitespace-pre-wrap pt-1 border-t mt-1">{anamnesisData.freeText}</p>
              )}
            </div>
          ) : (
            <p className="text-xs whitespace-pre-wrap">{consultation.anamnesis}</p>
          )}
        </DetailSection>
      )}

      {consultation.physicalExam && (
        <DetailSection icon={Activity} title="Осмотр">
          <p className="text-xs whitespace-pre-wrap">{consultation.physicalExam}</p>
        </DetailSection>
      )}

      {diagnoses.length > 0 && (
        <DetailSection icon={Stethoscope} title="Диагнозы">
          <div className="flex flex-wrap gap-1.5">
            {diagnoses.map((d) => <Badge key={d} variant="secondary" className="text-[10px]">{d}</Badge>)}
          </div>
        </DetailSection>
      )}

      {prescriptions.length > 0 && (
        <DetailSection icon={FilePlus2} title="Назначения">
          <div className="space-y-1">
            {prescriptions.map((item) => (
              <div key={item.id ?? item.name} className="rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
                <span className="font-medium">{item.name}</span>
                {[item.dosage, item.frequency, item.duration].filter(Boolean).length > 0 && (
                  <span className="text-muted-foreground"> — {[item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")}</span>
                )}
              </div>
            ))}
          </div>
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/60 p-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3 text-primary" /> {title}
      </p>
      {children}
    </div>
  );
}

function AddConsultationDialog({
  open, onOpenChange, petId, onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  petId: string;
  onAdd: ReturnType<typeof useAddConsultation>;
}) {
  const [type, setType] = React.useState<ConsultationType>("appointment");
  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [chiefComplaint, setChiefComplaint] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [vas, setVas] = React.useState("");
  const [weight, setWeight] = React.useState("");

  function reset() {
    setType("appointment");
    setChiefComplaint("");
    setNotes("");
    setVas("");
    setWeight("");
  }

  async function handleAdd() {
    if (!notes.trim()) {
      toast.error("Notes are required");
      return;
    }
    try {
      await onAdd.mutateAsync({
        petId,
        data: {
          date: new Date(date).toISOString(),
          type,
          chiefComplaint: chiefComplaint || null,
          notes,
          vasScore: vas ? Number(vas) : null,
          weight: weight ? Number(weight) : null,
        },
      });
      toast.success("Consultation entry added");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Add Consultation Entry</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {/* Quick templates */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-amber-500" /> Quick Templates
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setType(t.type);
                    setChiefComplaint(t.chiefComplaint);
                    setNotes(t.notes);
                  }}
                  className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent hover:border-primary/30 transition-colors"
                >
                  <t.icon className="h-3 w-3 text-primary" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ConsultationType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">Appointment</SelectItem>
                  <SelectItem value="diagnostic">Diagnostic</SelectItem>
                  <SelectItem value="treatment">Treatment</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chief Complaint</Label>
            <Input value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="e.g. Recurrent paw licking" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Clinical Notes *</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Subjective, objective, assessment, plan..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Weight (kg)</Label>
              <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pruritus VAS (1-10)</Label>
              <Input type="number" min="1" max="10" value={vas} onChange={(e) => setVas(e.target.value)} placeholder="optional" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={onAdd.isPending}>Add Entry</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
