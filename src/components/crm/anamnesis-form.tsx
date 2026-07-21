"use client";

import * as React from "react";
import { ClipboardList, Copy, PawPrint, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  buildBaseline, getAnamnesisFields, parseAnamnesisData, type AnamnesisFieldDef,
} from "@/lib/anamnesis-schema";
import type { ConsultationSpecialty, PetWithRelations } from "@/lib/types";
import { toast } from "sonner";

export type AnamnesisAnswers = Record<string, string | string[]>;

interface AnamnesisFormProps {
  pet: PetWithRelations;
  specialty: ConsultationSpecialty;
  answers: AnamnesisAnswers;
  onAnswersChange: (next: AnamnesisAnswers) => void;
  chiefComplaint: string;
  onChiefComplaintChange: (value: string) => void;
  freeText: string;
  onFreeTextChange: (value: string) => void;
  onEditPet?: () => void;
  /** id текущего приёма — исключается из поиска «прошлого приёма» */
  excludeConsultationId?: string | null;
}

export function AnamnesisForm({
  pet, specialty, answers, onAnswersChange, chiefComplaint, onChiefComplaintChange,
  freeText, onFreeTextChange,
  onEditPet, excludeConsultationId,
}: AnamnesisFormProps) {
  const fields = getAnamnesisFields(specialty);
  const baseline = buildBaseline(pet);

  const lastWithAnamnesis = React.useMemo(() => {
    return [...pet.consultations]
      .filter((c) => c.id !== excludeConsultationId && c.anamnesisData)
      .map((c) => ({ consultation: c, data: parseAnamnesisData(c.anamnesisData) }))
      .filter((entry) => entry.data && entry.data.specialty === specialty)
      .sort((a, b) => new Date(b.consultation.date).getTime() - new Date(a.consultation.date).getTime())[0] ?? null;
  }, [pet.consultations, specialty, excludeConsultationId]);

  function copyFromLast() {
    if (!lastWithAnamnesis?.data) return;
    onAnswersChange({ ...lastWithAnamnesis.data.answers });
    if (lastWithAnamnesis.data.freeText) onFreeTextChange(lastWithAnamnesis.data.freeText);
    toast.success("Анамнез скопирован из прошлого приёма", {
      description: `Приём от ${new Date(lastWithAnamnesis.consultation.date).toLocaleDateString("ru-RU")} — поправьте только то, что изменилось.`,
    });
  }

  function setAnswer(id: string, value: string | string[]) {
    const next = { ...answers };
    const isEmpty = Array.isArray(value) ? value.length === 0 : !String(value).trim();
    if (isEmpty) delete next[id];
    else next[id] = value;
    onAnswersChange(next);
  }

  return (
    <section className="rounded-2xl border-2 border-primary/20 bg-primary/[0.025] p-3 sm:p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Label className="text-base font-bold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" /> Анамнез
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Повторяемые данные подставлены из карточки пациента — заполните только то, что относится к визиту.
          </p>
        </div>
        {lastWithAnamnesis && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyFromLast}>
            <Copy className="h-3.5 w-3.5" /> Скопировать из прошлого приёма
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Причина обращения и жалобы</Label>
        <Textarea
          value={chiefComplaint}
          onChange={(event) => onChiefComplaintChange(event.target.value)}
          rows={5}
          placeholder="Опишите причину обращения, основные жалобы владельца, когда они появились и как менялись…"
          className="min-h-32 resize-y bg-background"
        />
      </div>

      {/* Данные из карточки пациента — не перепечатываются */}
      <div className="rounded-xl border bg-background p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <PawPrint className="h-3.5 w-3.5" /> Из карточки пациента
          </p>
          {onEditPet && (
            <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={onEditPet}>
              <Pencil className="h-3 w-3" /> Изменить карточку
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {baseline.map((item) => (
            <Badge
              key={item.label}
              variant={item.emphasis ? "default" : "secondary"}
              className={cn("font-normal text-[11px] py-1", item.emphasis && "bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300")}
            >
              <span className="font-semibold mr-1">{item.label}:</span> {item.value}
            </Badge>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Эти данные автоматически войдут в текст анамнеза.
        </p>
      </div>

      {/* Специализированные поля */}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <AnamnesisField
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(value) => setAnswer(field.id, value)}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Дополнительно</Label>
        <Textarea
          value={freeText}
          onChange={(event) => onFreeTextChange(event.target.value)}
          rows={3}
          placeholder="Всё, что не уложилось в поля выше: наблюдения владельца, детали, контекст…"
          className="bg-background"
        />
      </div>
    </section>
  );
}

function AnamnesisField({
  field, value, onChange,
}: {
  field: AnamnesisFieldDef;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  if (field.type === "select") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">{field.label}</Label>
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
          <SelectTrigger className="bg-background"><SelectValue placeholder="Не указано" /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "chips") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5 sm:col-span-2">
        <Label className="text-xs font-semibold">{field.label}</Label>
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((option) => {
            const isActive = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(isActive ? selected.filter((v) => v !== option) : [...selected, option])}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "toggle") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2">
        <Label className="text-xs font-semibold">{field.label}</Label>
        <Switch checked={value === "yes"} onCheckedChange={(checked) => onChange(checked ? "yes" : "")} />
      </div>
    );
  }

  // text
  const isLong = field.id === "pastTreatment" || field.id === "dietHistory";
  return (
    <div className={cn("space-y-1.5", isLong && "sm:col-span-2")}>
      <Label className="text-xs font-semibold">{field.label}</Label>
      {isLong ? (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder={field.placeholder}
          className="bg-background"
        />
      ) : (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="bg-background"
        />
      )}
    </div>
  );
}
