"use client";

import * as React from "react";
import { PawPrint, Plus, X } from "lucide-react";
import { useCreatePet, useUpdatePet } from "@/lib/hooks";
import { SPECIES_OPTIONS, LIFE_STAGE_OPTIONS, ACTIVITY_OPTIONS, splitOwnerContact } from "@/lib/clinical-data";
import {
  EMPTY_FEEDING, FOOD_TYPE_OPTIONS, parseFeeding, parseStringArray,
} from "@/lib/anamnesis-schema";
import type { PetWithRelations, Species, LifeStage, ActivityLevel, FeedingInfo } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PetFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pet?: PetWithRelations | null;
}

export function PetForm({ open, onOpenChange, pet }: PetFormProps) {
  const createMut = useCreatePet();
  const updateMut = useUpdatePet();
  const isEdit = !!pet;

  const [form, setForm] = React.useState({
    name: "",
    species: "dog" as Species,
    breed: "",
    birthDate: "",
    sex: "male",
    neutered: true,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    currentWeight: "",
    targetWeight: "",
    bcs: "5",
    lifeStage: "adult" as LifeStage,
    activityLevel: "moderate" as ActivityLevel,
    notes: "",
  });
  const [allergies, setAllergies] = React.useState<string[]>([]);
  const [chronicConditions, setChronicConditions] = React.useState<string[]>([]);
  const [feeding, setFeeding] = React.useState<FeedingInfo>(EMPTY_FEEDING);

  React.useEffect(() => {
    if (pet) {
      setForm({
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        birthDate: new Date(pet.birthDate).toISOString().split("T")[0],
        sex: pet.sex,
        neutered: pet.neutered,
        ownerName: pet.ownerName,
        ownerEmail: pet.ownerEmail ?? splitOwnerContact(pet.ownerContact).email,
        ownerPhone: pet.ownerPhone ?? splitOwnerContact(pet.ownerContact).phone,
        currentWeight: String(pet.currentWeight),
        targetWeight: pet.targetWeight ? String(pet.targetWeight) : "",
        bcs: String(pet.bcs),
        lifeStage: pet.lifeStage,
        activityLevel: pet.activityLevel,
        notes: pet.notes ?? "",
      });
      setAllergies(parseStringArray(pet.allergies));
      setChronicConditions(parseStringArray(pet.chronicConditions));
      setFeeding(parseFeeding(pet.feeding) ?? EMPTY_FEEDING);
    } else {
      setForm({
        name: "", species: "dog", breed: "", birthDate: "", sex: "male", neutered: true,
        ownerName: "", ownerEmail: "", ownerPhone: "", currentWeight: "", targetWeight: "", bcs: "5",
        lifeStage: "adult", activityLevel: "moderate", notes: "",
      });
      setAllergies([]);
      setChronicConditions([]);
      setFeeding(EMPTY_FEEDING);
    }
  }, [pet, open]);

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("Pet name is required");
      return;
    }
    const payload = {
      name: form.name,
      species: form.species,
      breed: form.breed,
      birthDate: form.birthDate || new Date().toISOString(),
      sex: form.sex,
      neutered: form.neutered,
      ownerName: form.ownerName,
      ownerEmail: form.ownerEmail || null,
      ownerPhone: form.ownerPhone || null,
      currentWeight: form.currentWeight || 0,
      targetWeight: form.targetWeight || null,
      bcs: form.bcs || 5,
      lifeStage: form.lifeStage,
      activityLevel: form.activityLevel,
      allergies,
      chronicConditions,
      feeding: feedingHasContent(feeding) ? feeding : null,
      notes: form.notes || null,
    };
    try {
      if (isEdit && pet) {
        await updateMut.mutateAsync({ id: pet.id, data: payload });
        toast.success(`${pet.name}'s record updated`);
      } else {
        await createMut.mutateAsync(payload);
        toast.success(`Patient ${form.name} added`);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PawPrint className="h-5 w-5 text-primary" />
            {isEdit ? "Edit Patient" : "New Patient"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the patient record and metrics." : "Create a new patient profile with vitals and nutritional baselines."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pet Name *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Mochi" />
            </Field>
            <Field label="Species">
              <Select value={form.species} onValueChange={(v) => set("species", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPECIES_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Breed">
              <Input value={form.breed} onChange={(e) => set("breed", e.target.value)} placeholder="French Bulldog" />
            </Field>
            <Field label="Date of Birth">
              <Input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
            </Field>
            <Field label="Sex">
              <Select value={form.sex} onValueChange={(v) => set("sex", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Neutered">
              <div className="flex items-center h-9 gap-2">
                <Switch checked={form.neutered} onCheckedChange={(v) => set("neutered", v)} />
                <span className="text-xs text-muted-foreground">{form.neutered ? "Yes" : "No"}</span>
              </div>
            </Field>
          </div>

          {/* Owner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Owner Name">
              <Input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="Sarah Chen" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} placeholder="owner@example.com" />
            </Field>
            <Field label="Phone">
              <Input type="tel" value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} placeholder="+7 900 000-00-00" />
            </Field>
          </div>

          {/* Nutritional metrics */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nutritional Baseline</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Current Weight (kg)">
                <Input type="number" step="0.1" value={form.currentWeight} onChange={(e) => set("currentWeight", e.target.value)} placeholder="12.0" />
              </Field>
              <Field label="Target Weight (kg)">
                <Input type="number" step="0.1" value={form.targetWeight} onChange={(e) => set("targetWeight", e.target.value)} placeholder="10.5" />
              </Field>
              <Field label="BCS (1-9)">
                <Input type="number" min="1" max="9" value={form.bcs} onChange={(e) => set("bcs", e.target.value)} />
              </Field>
              <Field label="Life Stage" className="col-span-2 sm:col-span-1">
                <Select value={form.lifeStage} onValueChange={(v) => set("lifeStage", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LIFE_STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Activity Level" className="col-span-2 sm:col-span-1">
                <Select value={form.activityLevel} onValueChange={(v) => set("activityLevel", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* Anamnesis baseline — entered once, auto-filled into every visit */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Анамнестическая база</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Заполняется один раз — автоматически подставляется в анамнез каждого приёма.</p>
            </div>
            <ChipListInput
              label="Аллергии"
              values={allergies}
              onChange={setAllergies}
              suggestions={ALLERGY_SUGGESTIONS}
              placeholder="Например: курица"
            />
            <ChipListInput
              label="Хронические состояния"
              values={chronicConditions}
              onChange={setChronicConditions}
              suggestions={CHRONIC_SUGGESTIONS}
              placeholder="Например: атопический дерматит"
            />
          </div>

          {/* Feeding */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Кормление</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Тип рациона" className="col-span-2 sm:col-span-1">
                <Select value={feeding.foodType} onValueChange={(v) => setFeeding((f) => ({ ...f, foodType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FOOD_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Корм / рацион">
                <Input value={feeding.brand} onChange={(e) => setFeeding((f) => ({ ...f, brand: e.target.value }))} placeholder="Марка или состав" />
              </Field>
              <Field label="Объём в сутки">
                <Input value={feeding.dailyAmount} onChange={(e) => setFeeding((f) => ({ ...f, dailyAmount: e.target.value }))} placeholder="Например: 180 г" />
              </Field>
              <Field label="Кормлений в день">
                <Input value={feeding.feedingsPerDay} onChange={(e) => setFeeding((f) => ({ ...f, feedingsPerDay: e.target.value }))} placeholder="2" />
              </Field>
              <Field label="Лакомства">
                <Input value={feeding.treats} onChange={(e) => setFeeding((f) => ({ ...f, treats: e.target.value }))} placeholder="Что и как часто" />
              </Field>
              <Field label="Добавки">
                <Input value={feeding.supplements} onChange={(e) => setFeeding((f) => ({ ...f, supplements: e.target.value }))} placeholder="Витамины, омега-3…" />
              </Field>
            </div>
          </div>

          <Field label="Clinical Notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Background, chronic conditions, owner concerns..." />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
            {isEdit ? "Save Changes" : "Create Patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ALLERGY_SUGGESTIONS = [
  "Курица", "Говядина", "Молочные продукты", "Пшеница", "Соя", "Яйцо", "Рыба",
  "Блошиная слюна", "Пылевые клещи", "Пыльца",
];

const CHRONIC_SUGGESTIONS = [
  "Атопический дерматит", "Пищевая аллергия", "Отит наружного уха", "Ожирение",
  "ХБП", "Панкреатит", "Сахарный диабет", "Гипотиреоз",
];

function feedingHasContent(feeding: FeedingInfo): boolean {
  return Boolean(
    feeding.brand.trim() || feeding.dailyAmount.trim() || feeding.feedingsPerDay.trim() ||
    feeding.treats.trim() || feeding.supplements.trim() || feeding.notes.trim(),
  );
}

function ChipListInput({
  label, values, onChange, suggestions, placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [input, setInput] = React.useState("");

  function add(value: string) {
    const trimmed = value.trim();
    if (!trimmed || values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...values, trimmed]);
    setInput("");
  }

  const unusedSuggestions = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex flex-wrap gap-1.5 min-h-6">
        {values.map((value) => (
          <Badge key={value} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
            {value}
            <button type="button" onClick={() => onChange(values.filter((v) => v !== value))} className="rounded-full p-0.5 hover:bg-background">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {values.length === 0 && <span className="text-xs text-muted-foreground py-1">Не отмечены</span>}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => add(input)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}
