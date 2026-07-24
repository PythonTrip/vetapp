"use client";

import * as React from "react";
import { useState } from "react";
import {
  Calculator, Flame, Scale, Droplet, Wheat, Beef, Beef as ProteinIcon,
  Sparkles, Info, CheckCircle2, AlertTriangle, ShoppingCart,
  Database, PackageOpen, UserRound, X, Search, FlaskConical,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, ReferenceLine, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  calculateRERMER, convertToDryMatter, estimateMEKcal, buildDietTemplate, summarizeDiet,
} from "@/lib/nutrition";
import {
  SPECIES_OPTIONS, LIFE_STAGE_OPTIONS, ACTIVITY_OPTIONS, NOVEL_PROTEINS,
} from "@/lib/clinical-data";
import type { Species, LifeStage, ActivityLevel, DietType, DietTemplateComponent, PetWithRelations } from "@/lib/types";
import type { BuiltDietComponent } from "@/lib/nutrition";
import {
  aggregateDietNutrients, buildNormComparison, resolveNorms, formatNutrientValue,
  productToDietComponent, NUTRIENT_DAY_SPECS, NORM_STANDARD_LABELS,
  type NormComparisonRow, type NormStandard,
} from "@/lib/nutrition-analysis";
import {
  fediafStageOptions, defaultFediafStage, fediafStage, estimateFediafMER,
} from "@/lib/fediaf";
import { FEDIAF_EDITION, FEDIAF_SOURCE_URL } from "@/lib/fediaf-data";
import {
  usePets, useCreateDietPlan, useNutritionProductSearch, useNutritionProductsByIds,
} from "@/lib/hooks";
import { useNutritionWorkspace, type NutritionTab } from "@/lib/nutrition-workspace";
import { toast } from "sonner";
import { NutritionProductCatalog } from "@/components/nutrition/product-catalog";

export function NutritionModule() {
  const activeTab = useNutritionWorkspace((s) => s.activeTab);
  const setActiveTab = useNutritionWorkspace((s) => s.setActiveTab);

  return (
    <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">
          <Calculator className="h-3.5 w-3.5" />
          Nutritionist Assistant
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Nutritional Assistant</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Единый поток работы: выберите пациента, рассчитайте потребность в энергии (RER/MER),
          сравните корма по сухому веществу и соберите рацион из продуктов каталога — граммовка
          считается по реальной энергетической ценности.
        </p>
      </div>

      <PatientContextBar />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NutritionTab)}>
        <div className="w-full min-w-0 overflow-x-auto scrollbar-thin">
        <TabsList className="flex h-10 w-max min-w-full max-w-3xl [&>*]:shrink-0 sm:grid sm:w-full sm:grid-cols-4">
          <TabsTrigger value="catalog" className="text-xs sm:text-sm gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" /> Каталог
          </TabsTrigger>
          <TabsTrigger value="rer-mer" className="text-xs sm:text-sm gap-1.5">
            <Flame className="h-3.5 w-3.5" /> RER / MER
          </TabsTrigger>
          <TabsTrigger value="dm" className="text-xs sm:text-sm gap-1.5">
            <Droplet className="h-3.5 w-3.5" /> Dry Matter
          </TabsTrigger>
          <TabsTrigger value="template" className="text-xs sm:text-sm gap-1.5">
            <Beef className="h-3.5 w-3.5" /> Diet Builder
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="catalog" className="mt-4">
          <NutritionProductCatalog />
        </TabsContent>

        <TabsContent value="rer-mer" className="mt-4">
          <RERMERCalculator />
        </TabsContent>
        <TabsContent value="dm" className="mt-4">
          <DryMatterConverter />
        </TabsContent>
        <TabsContent value="template" className="mt-4">
          <DietTemplateBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared Patient Context ───────────────────────────────────────
function PatientContextBar() {
  const pets = usePets();
  const patientId = useNutritionWorkspace((s) => s.patientId);
  const setPatientId = useNutritionWorkspace((s) => s.setPatientId);
  const pet = pets.data?.find((p) => p.id === patientId) ?? null;

  const merPreview = React.useMemo(() => {
    if (!pet) return null;
    return calculateRERMER(pet.currentWeight, pet.species, pet.lifeStage, pet.activityLevel, pet.neutered, pet.bcs, pet.targetWeight);
  }, [pet]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserRound className="h-4.5 w-4.5" />
        </span>
        <div>
          <div className="text-sm font-semibold">Пациент</div>
          <p className="text-xs text-muted-foreground">
            {pet
              ? "Параметры подставлены в калькулятор, планы сохраняются в один клик"
              : "Выберите пациента — калькулятор заполнится автоматически, а планы сохранятся в его карту"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pet && merPreview && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="tabular-nums">{pet.currentWeight} кг</Badge>
            <Badge variant="secondary" className="tabular-nums">BCS {pet.bcs}/9</Badge>
            <Badge className="tabular-nums gap-1"><Flame className="h-3 w-3" /> MER ≈ {merPreview.mer} ккал</Badge>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Select value={patientId ?? ""} onValueChange={(v) => setPatientId(v)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Выбрать пациента…" />
            </SelectTrigger>
            <SelectContent>
              {(pets.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.breed})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pet && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Сбросить пациента" onClick={() => setPatientId(null)}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function useSelectedPatient(): PetWithRelations | null {
  const pets = usePets();
  const patientId = useNutritionWorkspace((s) => s.patientId);
  return pets.data?.find((p) => p.id === patientId) ?? null;
}

// ─── RER / MER Calculator ─────────────────────────────────────────
function RERMERCalculator() {
  const [species, setSpecies] = useState<Species>("dog");
  const [weight, setWeight] = useState("12");
  const [lifeStage, setLifeStage] = useState<LifeStage>("adult");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [neutered, setNeutered] = useState(true);
  const [bcs, setBcs] = useState("5");
  const [targetWeight, setTargetWeight] = useState("");

  const patient = useSelectedPatient();
  const sendKcalToBuilder = useNutritionWorkspace((s) => s.sendKcalToBuilder);

  // Prefill inputs from the shared patient (once per patient change,
  // so manual tweaks are not overwritten by query refetches)
  const prefilledRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!patient || prefilledRef.current === patient.id) return;
    prefilledRef.current = patient.id;
    setSpecies(patient.species);
    setWeight(String(patient.currentWeight));
    setLifeStage(patient.lifeStage);
    setActivity(patient.activityLevel);
    setNeutered(patient.neutered);
    setBcs(String(patient.bcs));
    setTargetWeight(patient.targetWeight != null ? String(patient.targetWeight) : "");
  }, [patient]);

  const result = React.useMemo(() => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return null;
    return calculateRERMER(w, species, lifeStage, activity, neutered, parseInt(bcs) || 5, targetWeight ? parseFloat(targetWeight) : null);
  }, [weight, species, lifeStage, activity, neutered, bcs, targetWeight]);

  // FEDIAF 2025 direct MER estimate (allometric, life-stage specific) shown
  // alongside the RER × factor estimate; only computed for dogs & cats.
  const fediafMer = React.useMemo(() => {
    const w = parseFloat(weight);
    if (!w || w <= 0 || (species !== "dog" && species !== "cat")) return null;
    return estimateFediafMER(species, lifeStage, activity, neutered, w);
  }, [weight, species, lifeStage, activity, neutered]);

  const pets = usePets();
  const createDiet = useCreateDietPlan();

  async function saveToPet(petId: string) {
    if (!result) return;
    try {
      await createDiet.mutateAsync({
        petId,
        name: `RER/MER Plan (${new Date().toLocaleDateString()})`,
        type: "commercial",
        rer: result.rer,
        mer: result.mer,
        macros: JSON.stringify({}),
        notes: `Auto-saved from calculator. Weight ${weight}kg, BCS ${bcs}/9, ${lifeStage}, ${activity}.`,
      });
      toast.success("Saved to patient's diet plans");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function useInBuilder() {
    if (!result) return;
    sendKcalToBuilder(result.mer, patient ? `MER — ${patient.name}` : "MER из калькулятора");
    toast.success(`Целевая калорийность ${result.mer} ккал передана в конструктор рациона`);
  }

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {/* Inputs */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" /> Patient Parameters
          </CardTitle>
          <CardDescription className="text-xs">
            {patient ? `Заполнено из карты: ${patient.name}` : "Enter the pet's metrics to calculate energy needs"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Species">
              <Select value={species} onValueChange={(v) => setSpecies(v as Species)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SPECIES_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Body Weight (kg)">
              <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </Field>
            <Field label="Life Stage">
              <Select value={lifeStage} onValueChange={(v) => setLifeStage(v as LifeStage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LIFE_STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Activity Level">
              <Select value={activity} onValueChange={(v) => setActivity(v as ActivityLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTIVITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="BCS (1-9)">
              <Input type="number" min="1" max="9" value={bcs} onChange={(e) => setBcs(e.target.value)} />
            </Field>
            <Field label="Neutered">
              <Select value={neutered ? "yes" : "no"} onValueChange={(v) => setNeutered(v === "yes")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Target Weight (kg)" full>
              <Input type="number" step="0.1" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} placeholder="optional — for weight loss plans" />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" /> Energy Requirements
          </CardTitle>
          <CardDescription className="text-xs">RER × factor и прямая оценка FEDIAF 2025 по формулам МЭ</CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Enter a valid weight to calculate.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-4">
                  <div className="text-[11px] uppercase font-semibold text-muted-foreground">Resting Energy Requirement</div>
                  <div className="text-3xl font-bold tabular-nums mt-1">{result.rer}</div>
                  <div className="text-xs text-muted-foreground">kcal / day</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">70 × W<sup>0.75</sup></div>
                </div>
                <div className="rounded-xl bg-primary/10 p-4">
                  <div className="text-[11px] uppercase font-semibold text-primary">Maintenance Energy</div>
                  <div className="text-3xl font-bold tabular-nums mt-1 text-primary">{result.mer}</div>
                  <div className="text-xs text-muted-foreground">kcal / day target</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">RER × factor</div>
                </div>
              </div>

              {/* Applicable factors */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Applicable MER Factors</div>
                <div className="flex flex-wrap gap-2">
                  {result.merFactors.map((f, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {f.label}: <span className="font-bold tabular-nums">{f.value}×</span>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* FEDIAF 2025 direct energy estimate */}
              {fediafMer && (
                <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">FEDIAF 2025 · MER</span>
                    <Badge variant="outline" className="shrink-0 text-[9px]">{fediafMer.phase.labelRu}</Badge>
                  </div>
                  {fediafMer.kcal != null ? (
                    <div className="flex items-end gap-3">
                      <div>
                        <div className="text-2xl font-bold tabular-nums text-primary">{fediafMer.kcal}</div>
                        <div className="text-[10px] text-muted-foreground">ккал ME / день</div>
                      </div>
                      {fediafMer.low != null && fediafMer.high != null && (
                        <div className="pb-1 text-[11px] tabular-nums text-muted-foreground">
                          диапазон {fediafMer.low}–{fediafMer.high} ккал
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Прямой расчёт для этой стадии требует доп. параметров — ниже приведена формула FEDIAF.
                    </div>
                  )}
                  <div className="rounded-md bg-background/60 p-2 text-[10px] leading-4 text-muted-foreground">
                    <span className="font-medium text-foreground">Формула:</span> {fediafMer.phase.formula}
                    {fediafMer.phase.range ? ` (${fediafMer.phase.range})` : ""}
                    {fediafMer.phase.page ? ` · с. ${fediafMer.phase.page}` : ""}
                    {fediafMer.note && <div className="mt-1">{fediafMer.note}</div>}
                    {fediafMer.alternates.length > 0 && (
                      <div className="mt-1">
                        Альтернативы: {fediafMer.alternates.map((a) => `${a.labelRu} — ${a.formula}`).join("; ")}
                      </div>
                    )}
                  </div>
                  {fediafMer.kcal != null && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-full gap-1.5 text-xs"
                      onClick={() => {
                        sendKcalToBuilder(fediafMer.kcal!, patient ? `FEDIAF MER — ${patient.name}` : "FEDIAF MER");
                        toast.success(`Целевая калорийность ${fediafMer.kcal} ккал (FEDIAF) передана в конструктор`);
                      }}
                    >
                      <Beef className="h-3.5 w-3.5" /> Использовать {fediafMer.kcal} ккал (FEDIAF) в конструкторе
                    </Button>
                  )}
                </div>
              )}

              {/* Weight status */}
              <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${result.weightStatus === "ideal" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : result.weightStatus === "underweight" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                {result.weightStatus === "ideal" ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
                <div>
                  <span className="font-semibold capitalize">{result.weightStatus}</span> — BCS {bcs}/9
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {result.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                </div>
              </div>

              {/* Hand off to builder + save */}
              <div className="pt-2 border-t space-y-2">
                <Button className="w-full gap-1.5" onClick={useInBuilder}>
                  <Beef className="h-4 w-4" /> Использовать {result.mer} ккал в конструкторе рациона
                </Button>
                {patient ? (
                  <Button variant="outline" className="w-full" disabled={createDiet.isPending} onClick={() => saveToPet(patient.id)}>
                    Сохранить план для {patient.name}
                  </Button>
                ) : pets.data && pets.data.length > 0 ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Save as Diet Plan</div>
                    <Select onValueChange={saveToPet}>
                      <SelectTrigger><SelectValue placeholder="Choose a patient to save this plan..." /></SelectTrigger>
                      <SelectContent>
                        {pets.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.breed})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Dry Matter Converter ─────────────────────────────────────────
function DryMatterConverter() {
  const [protein, setProtein] = useState("25");
  const [fat, setFat] = useState("14");
  const [fiber, setFiber] = useState("3");
  const [moisture, setMoisture] = useState("10");

  const dmPrefill = useNutritionWorkspace((s) => s.dmPrefill);
  const clearDmPrefill = useNutritionWorkspace((s) => s.clearDmPrefill);

  // Apply values pushed from the product catalog
  React.useEffect(() => {
    if (!dmPrefill) return;
    setProtein(String(dmPrefill.protein));
    setFat(String(dmPrefill.fat));
    setFiber(String(dmPrefill.fiber));
    setMoisture(String(dmPrefill.moisture));
  }, [dmPrefill]);

  const result = React.useMemo(() => {
    return convertToDryMatter(
      parseFloat(protein) || 0,
      parseFloat(fat) || 0,
      parseFloat(fiber) || 0,
      parseFloat(moisture) || 0
    );
  }, [protein, fat, fiber, moisture]);

  const me = estimateMEKcal(result.proteinDM, result.fatDM, result.carbsDM, result.dryMatterPct);
  const catalogMe = dmPrefill?.meKcalPerKg ?? null;
  const meDeltaPct = catalogMe && catalogMe > 0 ? Math.round(((me - catalogMe) / catalogMe) * 100) : null;

  const macroData = [
    { name: "Protein", asFed: parseFloat(protein) || 0, dm: result.proteinDM, fill: "oklch(0.6 0.13 175)" },
    { name: "Fat", asFed: parseFloat(fat) || 0, dm: result.fatDM, fill: "oklch(0.7 0.14 85)" },
    { name: "Fiber", asFed: parseFloat(fiber) || 0, dm: result.fiberDM, fill: "oklch(0.65 0.15 145)" },
    { name: "Carbs*", asFed: 0, dm: result.carbsDM, fill: "oklch(0.7 0.12 305)" },
  ];

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Droplet className="h-4 w-4 text-primary" /> Guaranteed Analysis (Label)
          </CardTitle>
          <CardDescription className="text-xs">Enter percentages as-printed on the pet food label (as-fed basis)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dmPrefill && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
              <Database className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1 truncate text-xs font-medium" title={dmPrefill.productName}>
                {dmPrefill.productName}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="Отвязать продукт" onClick={clearDmPrefill}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Field label="Crude Protein (%)"><Input type="number" step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} /></Field>
          <Field label="Crude Fat (%)"><Input type="number" step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} /></Field>
          <Field label="Crude Fiber (%)"><Input type="number" step="0.1" value={fiber} onChange={(e) => setFiber(e.target.value)} /></Field>
          <Field label="Moisture (%)"><Input type="number" step="0.1" value={moisture} onChange={(e) => setMoisture(e.target.value)} /></Field>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>Dry Matter = 100 − Moisture. DM% = (as-fed %) / DM × 100. This lets you fairly compare foods with different moisture (e.g. dry kibble vs canned). Продукт из каталога можно подставить кнопкой «Анализ DM».</span>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Dry Matter Basis
          </CardTitle>
          <CardDescription className="text-xs">For accurate comparison across food types</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ResultStat label="Protein (DM)" value={`${result.proteinDM}%`} icon={ProteinIcon} color="text-teal-600" />
            <ResultStat label="Fat (DM)" value={`${result.fatDM}%`} icon={Droplet} color="text-amber-600" />
            <ResultStat label="Fiber (DM)" value={`${result.fiberDM}%`} icon={Wheat} color="text-emerald-600" />
            <ResultStat label="Carbs (DM)" value={`${result.carbsDM}%`} icon={Wheat} color="text-violet-600" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Dry Matter</div>
              <div className="text-xl font-bold tabular-nums">{result.dryMatterPct}%</div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Est. Energy</div>
              <div className="text-xl font-bold tabular-nums">{me}</div>
              <div className="text-[9px] text-muted-foreground">kcal/kg (modified Atwater)</div>
              {catalogMe != null && (
                <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                  каталог: <b className="text-foreground">{Math.round(catalogMe)}</b> ккал/кг
                  {meDeltaPct != null && meDeltaPct !== 0 && (
                    <span className={Math.abs(meDeltaPct) > 10 ? " text-amber-600" : ""}> ({meDeltaPct > 0 ? "+" : ""}{meDeltaPct}%)</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={macroData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" />
                <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" unit="%" />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="asFed" name="As-fed" fill="oklch(0.8 0.02 172)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="dm" name="Dry matter" radius={[3, 3, 0, 0]}>
                  {macroData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> As-fed (label)</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-teal-500" /> Dry matter basis</span>
            <span>*Carbs calculated by difference (assumes ~2.5% ash)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Diet Template Builder ────────────────────────────────────────
const CATEGORY_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  protein: { label: "Protein", color: "oklch(0.6 0.13 175)", icon: Beef },
  organ: { label: "Organ", color: "oklch(0.65 0.18 40)", icon: Beef },
  bone: { label: "Bone", color: "oklch(0.6 0.05 250)", icon: Beef },
  vegetable: { label: "Vegetable", color: "oklch(0.65 0.15 145)", icon: Wheat },
  grain: { label: "Grain", color: "oklch(0.7 0.1 85)", icon: Wheat },
  supplement: { label: "Supplement", color: "oklch(0.7 0.12 305)", icon: Sparkles },
  fat: { label: "Fat", color: "oklch(0.7 0.14 85)", icon: Droplet },
  commercial: { label: "Commercial", color: "oklch(0.6 0.12 250)", icon: PackageOpen },
};

function DietTemplateBuilder() {
  const type = useNutritionWorkspace((s) => s.dietType);
  const setType = useNutritionWorkspace((s) => s.setDietType);
  const dailyKcal = useNutritionWorkspace((s) => s.dailyKcal);
  const setDailyKcal = useNutritionWorkspace((s) => s.setDailyKcal);
  const components = useNutritionWorkspace((s) => s.components);
  const setComponents = useNutritionWorkspace((s) => s.setComponents);
  const targetKcal = useNutritionWorkspace((s) => s.targetKcal);
  const targetKcalSource = useNutritionWorkspace((s) => s.targetKcalSource);

  const patient = useSelectedPatient();

  const totalPct = components.reduce((s, c) => s + c.percentage, 0);
  const isBalanced = Math.abs(totalPct - 100) < 0.5;

  const built = React.useMemo(() => {
    const kcal = parseFloat(dailyKcal) || 0;
    if (kcal <= 0) return [];
    return buildDietTemplate(components, kcal);
  }, [components, dailyKcal]);

  const summary = React.useMemo(() => summarizeDiet(built), [built]);

  function updateComponent(i: number, field: "category" | "percentage", value: string | number) {
    setComponents(components.map((c, idx) => (
      idx === i ? ({ ...c, [field]: value } as DietTemplateComponent) : c
    )));
  }
  function removeComponent(i: number) {
    setComponents(components.filter((_, idx) => idx !== i));
  }

  // Proportionally rescale all shares so they sum to exactly 100%
  function normalizeTo100() {
    const total = components.reduce((sum, c) => sum + c.percentage, 0);
    if (total <= 0) return;
    let allocated = 0;
    setComponents(components.map((c, i) => {
      if (i === components.length - 1) {
        return { ...c, percentage: Math.round((100 - allocated) * 10) / 10 };
      }
      const pct = Math.round((c.percentage / total) * 1000) / 10;
      allocated += pct;
      return { ...c, percentage: pct };
    }));
  }

  const pieData = components.filter((c) => c.percentage > 0).map((c) => ({
    name: c.ingredient || c.category,
    value: c.percentage,
    fill: CATEGORY_META[c.category]?.color ?? "oklch(0.7 0.02 172)",
  }));

  const pets = usePets();
  const createDiet = useCreateDietPlan();

  async function saveToPet(petId: string) {
    const kcal = parseFloat(dailyKcal) || 0;
    try {
      await createDiet.mutateAsync({
        petId,
        name: `${type.toUpperCase()} Diet Template`,
        type,
        rer: kcal / 1.6,
        mer: kcal,
        macros: JSON.stringify(
          summary.proteinG != null ? { proteinG: summary.proteinG, fatG: summary.fatG } : {}
        ),
        template: JSON.stringify(components),
        notes: `Daily target: ${kcal} kcal · ~${summary.totalGrams} g/day. Components: ${components.map((c) => `${c.ingredient} ${c.percentage}%`).join(", ")}.`,
      });
      toast.success("Diet template saved to patient");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  const showApplyTarget = targetKcal != null && String(targetKcal) !== dailyKcal;

  return (
    <div className="space-y-4">
    <div className="grid lg:grid-cols-5 gap-4">
      {/* Builder */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Beef className="h-4 w-4 text-primary" /> Recipe Constructor
              </CardTitle>
              <CardDescription className="text-xs">
                Рацион собирается из продуктов каталога — найдите их поиском ниже или на вкладке «Каталог»
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Diet Type">
              <Select value={type} onValueChange={(v) => setType(v as DietType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="barf">BARF (Raw)</SelectItem>
                  <SelectItem value="home_cooked">Home-Cooked</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Daily Target kcal">
              <Input type="number" value={dailyKcal} onChange={(e) => setDailyKcal(e.target.value)} />
            </Field>
          </div>

          {showApplyTarget && (
            <button
              type="button"
              onClick={() => setDailyKcal(String(targetKcal))}
              className="flex w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-left text-xs transition-colors hover:bg-primary/10"
            >
              <Flame className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="flex-1">
                {targetKcalSource}: <b className="tabular-nums">{targetKcal} ккал</b> — нажмите, чтобы применить
              </span>
            </button>
          )}

          <Separator />

          <div className="space-y-2">
            {components.length === 0 && (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                <Database className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />
                <p className="text-xs font-medium">Рацион пуст</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Найдите продукты через поиск ниже — граммовка и анализ посчитаются по данным каталога
                </p>
              </div>
            )}
            {components.map((c, i) => {
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                  <Select value={c.category} onValueChange={(v) => updateComponent(i, "category", v)}>
                    <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_META).map(([k, m]) => (
                        <SelectItem key={k} value={k}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium" title={c.ingredient}>
                    {c.ingredient}
                  </span>
                  {c.meKcalPerKg != null && (
                    <span className="hidden shrink-0 text-[9px] tabular-nums text-muted-foreground sm:inline">
                      {Math.round(c.meKcalPerKg)} ккал/кг
                    </span>
                  )}
                  <div className="flex w-24 items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={c.percentage}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value) || 0;
                        updateComponent(i, "percentage", Math.min(100, Math.max(0, parsed)));
                      }}
                      className="h-8 w-[4.5rem] text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {built[i] && (
                    <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">{built[i].grams}g</Badge>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeComponent(i)}>
                    ×
                  </Button>
                </div>
              );
            })}
            <InlineCatalogSearch />
          </div>

          {components.length > 0 && (
            <div className={`rounded-lg p-2.5 text-sm flex items-center gap-2 ${isBalanced ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
              {isBalanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span className="flex-1">
                Total: <span className="font-bold tabular-nums">{Math.round(totalPct * 10) / 10}%</span>{" "}
                {isBalanced ? "✓ Balanced recipe" : `— should total 100% (off by ${Math.round((100 - totalPct) * 10) / 10}%)`}
              </span>
              {!isBalanced && totalPct > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 border-current/30 text-xs text-inherit hover:text-inherit"
                  onClick={normalizeTo100}
                >
                  Выровнять до 100%
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visualization & save */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recipe Composition</CardTitle>
          </CardHeader>
          <CardContent>
            {built.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Состав появится после добавления продуктов из каталога.
              </p>
            )}
            {pieData.length > 0 && (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 172)", fontSize: 11 }} formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 space-y-1">
              {built.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: CATEGORY_META[c.category]?.color }} />
                  <span className="flex-1 truncate">{c.ingredient || c.category}</span>
                  <span className="font-semibold tabular-nums">{c.grams}g</span>
                  <span className="text-muted-foreground tabular-nums">{c.kcal} kcal</span>
                </div>
              ))}
            </div>

            {built.length > 0 && (
              <div className="mt-3 space-y-1.5 rounded-lg bg-muted/40 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">Итого в день</span>
                  <span className="font-bold tabular-nums">{summary.totalGrams} г · {summary.totalKcal} ккал</span>
                </div>
                {summary.proteinG != null && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Белок / жир</span>
                    <span className="tabular-nums">{summary.proteinG} г / {summary.fatG} г
                      <span className="ml-1 text-[10px]">({Math.round(summary.macroCoverage * 100)}% массы)</span>
                    </span>
                  </div>
                )}
                {summary.linkedCount > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Database className="h-3 w-3 text-primary" />
                    {summary.linkedCount} комп. из каталога — граммовка по реальной ME
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Save to Patient</CardTitle>
            <CardDescription className="text-xs">Store this template with a patient's diet plans</CardDescription>
          </CardHeader>
          <CardContent>
            {components.length === 0 ? (
              <p className="text-xs text-muted-foreground">Добавьте продукты, чтобы сохранить рацион.</p>
            ) : patient ? (
              <Button className="w-full" disabled={createDiet.isPending} onClick={() => saveToPet(patient.id)}>
                Сохранить рацион для {patient.name}
              </Button>
            ) : pets.data && pets.data.length > 0 ? (
              <Select onValueChange={saveToPet}>
                <SelectTrigger><SelectValue placeholder="Choose a patient..." /></SelectTrigger>
                <SelectContent>
                  {pets.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.breed})</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">No patients yet. Add one in the CRM first.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Novel Protein Reference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {NOVEL_PROTEINS.slice(0, 5).map((p) => (
              <div key={p.protein} className="flex items-center justify-between text-xs">
                <span className="font-medium">{p.protein}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{p.species.join("/")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>

    <DietNutrientAnalysis built={built} dailyKcal={parseFloat(dailyKcal) || 0} />
    </div>
  );
}

// ─── Inline catalog search (inside Diet Builder) ──────────────────
function InlineCatalogSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const search = useNutritionProductSearch(query);
  const addProductToDiet = useNutritionWorkspace((s) => s.addProductToDiet);

  React.useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const results = search.data ?? [];
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Найти продукт в каталоге и добавить в рацион…"
        className="h-9 pl-9 text-xs"
      />
      {showDropdown && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover shadow-lg">
          {search.isLoading ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Ищем в каталоге…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Ничего не найдено</div>
          ) : (
            results.map((product) => {
              const me = product.nutrients.find((n) => n.code === "ME")?.value;
              return (
                <button
                  key={product.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60"
                  onClick={() => {
                    const added = addProductToDiet(productToDietComponent(product));
                    if (added) {
                      toast.success(`«${product.name}» добавлен в рацион`);
                      setQuery("");
                      setOpen(false);
                    } else {
                      toast.info("Этот продукт уже есть в рационе");
                    }
                  }}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{product.name}</span>
                  <Badge variant="outline" className="shrink-0 text-[9px] capitalize">{product.category}</Badge>
                  {me != null && (
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{Math.round(me)} ккал/кг</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Diet Nutrient Analysis ───────────────────────────────────────
const ENERGY_SPLIT_COLORS = {
  protein: "oklch(0.6 0.13 175)",
  fat: "oklch(0.7 0.14 85)",
  carbs: "oklch(0.7 0.12 305)",
} as const;

function DietNutrientAnalysis({ built, dailyKcal }: { built: BuiltDietComponent[]; dailyKcal: number }) {
  const patient = useSelectedPatient();
  const species: Species = patient?.species === "cat" ? "cat" : "dog";
  const lifeStage: LifeStage = patient?.lifeStage ?? "adult";

  const normStandard = useNutritionWorkspace((s) => s.normStandard);
  const setNormStandard = useNutritionWorkspace((s) => s.setNormStandard);
  const normStageRaw = useNutritionWorkspace((s) => s.normStage);
  const setNormStage = useNutritionWorkspace((s) => s.setNormStage);

  const stageOptions = React.useMemo(() => fediafStageOptions(species), [species]);
  const effectiveStage = React.useMemo(() => {
    if (normStandard !== "fediaf2025") return "";
    const fallback = defaultFediafStage(species, lifeStage);
    // Honour an explicit choice only while it belongs to the current species.
    return normStageRaw && stageOptions.some((o) => o.code === normStageRaw) ? normStageRaw : fallback;
  }, [normStandard, normStageRaw, species, lifeStage, stageOptions]);
  const stageMeta = normStandard === "fediaf2025" ? fediafStage(effectiveStage) : undefined;

  const linkedIds = React.useMemo(
    () => [...new Set(built.filter((c) => c.productId != null && c.grams > 0).map((c) => c.productId as number))],
    [built]
  );
  const productsQuery = useNutritionProductsByIds(linkedIds);

  const analysis = React.useMemo(() => {
    const productsById = new Map((productsQuery.data ?? []).map((p) => [p.id, p]));
    return aggregateDietNutrients(built, productsById);
  }, [built, productsQuery.data]);

  const norms = React.useMemo(
    () => resolveNorms(normStandard, species, effectiveStage),
    [normStandard, species, effectiveStage]
  );
  const normRows = React.useMemo(
    () => buildNormComparison(analysis, dailyKcal, norms),
    [analysis, dailyKcal, norms]
  );

  if (linkedIds.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-5">
          <FlaskConical className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Нутриентный анализ появится, когда в рационе будут продукты из каталога (с долей &gt; 0%) —
            найдите их через поиск выше или добавьте на вкладке «Каталог».
          </p>
        </CardContent>
      </Card>
    );
  }

  const energyTotal = analysis.proteinKcal + analysis.fatKcal + analysis.carbsKcal;
  const energyParts = [
    { key: "protein", label: "Белок", kcal: analysis.proteinKcal, color: ENERGY_SPLIT_COLORS.protein },
    { key: "fat", label: "Жир", kcal: analysis.fatKcal, color: ENERGY_SPLIT_COLORS.fat },
    { key: "carbs", label: "Углеводы", kcal: analysis.carbsKcal, color: ENERGY_SPLIT_COLORS.carbs },
  ].filter((p) => p.kcal > 0);

  const caPOk = analysis.caPRatio != null && analysis.caPRatio >= 1.0 && analysis.caPRatio <= 2.0;
  const coveragePct = Math.round(analysis.coverage * 100);

  const normByCode = new Map<string, NormComparisonRow>(normRows.map((row) => [row.code, row]));
  const standardLabel = NORM_STANDARD_LABELS[normStandard];

  const pctRows = (codes: string[]): NutrientChartRow[] =>
    codes.flatMap((code) => {
      const row = normByCode.get(code);
      if (!row) return [];
      return [{
        label: row.label,
        value: Math.min(row.pct, 300),
        text: `${Math.round(row.pct)}%`,
        deficit: row.pct < 90,
        tooltip: `${formatNutrientValue(row.value)} ${row.unit} в день · норма ${formatNutrientValue(row.norm)} ${row.unit}${row.pct > 300 ? ` · фактически ${Math.round(row.pct)}%` : ""}`,
      }];
    });

  const absRow = (label: string, value: number | undefined, unit: string, normCode?: string): NutrientChartRow[] => {
    if (value == null || value <= 0) return [];
    const norm = normCode ? normByCode.get(normCode) : undefined;
    return [{
      label,
      value,
      text: `${formatNutrientValue(value)} ${unit}`,
      deficit: norm != null && norm.pct < 90,
      tooltip: norm
        ? `${Math.round(norm.pct)}% от нормы (${formatNutrientValue(norm.norm)} ${norm.unit})`
        : "Справочно — без нормы",
    }];
  };

  const mainRows = [
    ...absRow("Белок", analysis.proteinG, "г", "CP"),
    ...absRow("Жир", analysis.fatG, "г", "CFa"),
    ...absRow("Углеводы (НФЭ)", analysis.carbsG, "г"),
    ...absRow("Клетчатка", analysis.fiberG, "г"),
  ];
  const mineralRows = pctRows(["Ca", "P", "Mg", "Na", "K", "Cl", "Fe", "Cu", "Zn", "Mn", "Se", "J"]);
  // A/D carry a norm under FEDIAF (given in IU); pctRows silently drops codes
  // without a norm, so they only chart when the active standard provides one.
  const vitaminRows = pctRows(["A", "D", "E", "B1", "B2", "B3", "B4", "B5", "B6", "B9", "B12"]);
  const aminoRows = NUTRIENT_DAY_SPECS
    .filter((spec) => spec.group === "amino")
    .flatMap((spec) => absRow(spec.label, analysis.totals[spec.code], spec.unit, spec.code));
  const fattyRows = [
    ...absRow("Линолевая (ω6)", analysis.totals["LA"], "г", "LA"),
    ...absRow("Арахидоновая (ω6)", analysis.totals["AA"], "г", "AA"),
    ...absRow("α-линоленовая (ω3)", analysis.totals["ALA"], "г", "ALA"),
    ...absRow("EPA (ω3)", analysis.totals["EPA"], "г"),
    ...absRow("DHA (ω3)", analysis.totals["DHA"], "г"),
    ...(normByCode.has("EPA_DHA")
      ? absRow("ЭПК+ДГК (ω3)", (analysis.totals["EPA"] ?? 0) + (analysis.totals["DHA"] ?? 0) || undefined, "г", "EPA_DHA")
      : []),
  ];
  // Vitamins with catalog data but no norm under the active standard (unit «МЕ»
  // under NRC, or no reference allowance) — shown as plain reference tiles.
  const referenceVitamins = ["A", "D", "C", "B7"]
    .map((code) => NUTRIENT_DAY_SPECS.find((spec) => spec.code === code))
    .flatMap((spec) => (spec && analysis.totals[spec.code] != null && !normByCode.has(spec.code)
      ? [{ ...spec, value: analysis.totals[spec.code] }] : []));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" /> Нутриентный анализ рациона
            </CardTitle>
            <CardDescription className="text-xs">
              По данным каталога · покрыто {coveragePct}% массы рациона ({Math.round(analysis.coveredGrams)} из {Math.round(analysis.totalGrams)} г)
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={normStandard} onValueChange={(v) => setNormStandard(v as NormStandard)}>
              <SelectTrigger className="h-8 w-[9.5rem] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fediaf2025">FEDIAF 2025</SelectItem>
                <SelectItem value="nrc2006">NRC 2006</SelectItem>
              </SelectContent>
            </Select>
            {normStandard === "fediaf2025" && (
              <Select value={effectiveStage} onValueChange={(v) => setNormStage(v)}>
                <SelectTrigger className="h-8 w-[13.5rem] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stageOptions.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Badge variant="secondary" className="gap-1.5">
              {species === "cat" ? "Кошка" : "Собака"} · на {Math.round(dailyKcal)} ккал
            </Badge>
          </div>
        </div>
        {coveragePct < 60 && (
          <div className="mt-1 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Меньше 60% массы рациона связано с каталогом — итоги занижены. Замените ручные компоненты продуктами из каталога.
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Key stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <ResultStat label="Белок / день" value={`${formatNutrientValue(analysis.proteinG)} г`} icon={ProteinIcon} color="text-teal-600" />
          <ResultStat label="Жир / день" value={`${formatNutrientValue(analysis.fatG)} г`} icon={Droplet} color="text-amber-600" />
          <ResultStat label="Углеводы / день" value={`${formatNutrientValue(analysis.carbsG)} г`} icon={Wheat} color="text-violet-600" />
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-muted-foreground">
              <Scale className={`h-3 w-3 ${caPOk ? "text-emerald-600" : "text-amber-600"}`} /> Ca : P
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-xl font-bold tabular-nums">
                {analysis.caPRatio != null ? formatNutrientValue(analysis.caPRatio) : "—"}
              </span>
              {analysis.caPRatio != null && (
                caPOk
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              )}
            </div>
            <div className="text-[9px] text-muted-foreground">целевой диапазон 1.0–2.0</div>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-muted-foreground">
              <Droplet className="h-3 w-3 text-sky-600" /> ω6 : ω3
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {analysis.omega6to3 != null ? formatNutrientValue(analysis.omega6to3) : "—"}
            </div>
            <div className="text-[9px] text-muted-foreground">ориентир 2–10 : 1</div>
          </div>
        </div>

        {/* Energy split */}
        {energyTotal > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Структура энергии</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(energyTotal)} ккал по покрытой массе</span>
            </div>
            <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-md">
              {energyParts.map((part) => (
                <div
                  key={part.key}
                  className="h-full min-w-[2px] rounded-sm"
                  style={{ width: `${(part.kcal / energyTotal) * 100}%`, background: part.color }}
                  title={`${part.label}: ${Math.round(part.kcal)} ккал (${Math.round((part.kcal / energyTotal) * 100)}%)`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {energyParts.map((part) => (
                <span key={part.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ background: part.color }} />
                  {part.label} <b className="tabular-nums text-foreground">{Math.round((part.kcal / energyTotal) * 100)}%</b>
                  <span className="tabular-nums">· {Math.round(part.kcal)} ккал</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Charts by nutrient group */}
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
          <NutrientChartSection title="Основные" subtitle="г/день по покрытой массе" rows={mainRows} unit="г" />
          <NutrientChartSection title="Минералы" subtitle={`% от нормы ${standardLabel}`} rows={mineralRows} reference />
          <NutrientChartSection title="Витамины" subtitle={`% от нормы ${standardLabel}`} rows={vitaminRows} reference>
            {referenceVitamins.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {referenceVitamins.map((item) => (
                  <div key={item.code} className="rounded-lg border bg-muted/20 p-2">
                    <div className="truncate text-[10px] font-medium text-muted-foreground" title={item.label}>
                      {item.label}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold tabular-nums">
                      {formatNutrientValue(item.value)}
                      <span className="ml-1 text-[9px] font-normal text-muted-foreground">{item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </NutrientChartSection>
          <NutrientChartSection title="Аминокислоты" subtitle="г/день · тултип — % нормы, где она есть" rows={aminoRows} unit="г" />
          <NutrientChartSection title="Жирные кислоты" subtitle="г/день" rows={fattyRows} unit="г" />
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.6 0.13 175)" }} /> ≥ 90% нормы / справочное значение
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.75 0.14 75)" }} /> дефицит (&lt; 90% нормы)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-px border-l border-dashed border-foreground/50" /> 100% нормы
            </span>
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">
            {normStandard === "fediaf2025" ? (
              <>
                Ориентир — минимально рекомендуемые уровни {FEDIAF_EDITION}
                {stageMeta ? ` (${stageMeta.labelRu}${stageMeta.merReference ? `, ${stageMeta.merReference}` : ""})` : ""}{" "}
                на 1000 ккал МЭ, масштабированные к целевой калорийности. Селен и таурин взяты для сухих рационов;
                витамин E — в МЕ.
              </>
            ) : (
              <>
                Ориентир — рекомендуемые нормы NRC 2006 для взрослых животных на 1000 ккал МЭ, масштабированные
                к целевой калорийности рациона.
              </>
            )}{" "}
            Шкала «% от нормы» обрезана на 300% (фактический процент — в подписи и тултипе). Значения справочные
            и учитывают только массу, покрытую каталогом; для клинических решений сверяйтесь с актуальными таблицами{" "}
            <a href={FEDIAF_SOURCE_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              FEDIAF
            </a>
            /NRC.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Nutrient bar charts ──────────────────────────────────────────
interface NutrientChartRow {
  label: string;
  value: number;
  text: string;
  deficit: boolean;
  tooltip: string;
}

function NutrientChartSection({
  title, subtitle, rows, reference, unit, children,
}: {
  title: string;
  subtitle: string;
  rows: NutrientChartRow[];
  reference?: boolean;
  unit?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground/80">{subtitle}</span>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
          Нет данных каталога для этой группы
        </div>
      ) : (
        <NutrientBarChart rows={rows} reference={reference} unit={unit} />
      )}
      {children}
    </div>
  );
}

function NutrientBarChart({ rows, reference, unit }: { rows: NutrientChartRow[]; reference?: boolean; unit?: string }) {
  const height = rows.length * 30 + 28;
  const maxValue = Math.max(...rows.map((r) => r.value));
  const domainMax = reference
    ? Math.min(320, Math.max(120, Math.ceil(maxValue / 20) * 20))
    : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="oklch(0.9 0.01 172)" />
        <XAxis
          type="number"
          {...(domainMax != null ? { domain: [0, domainMax] as [number, number] } : {})}
          tick={{ fontSize: 9 }}
          stroke="oklch(0.6 0.02 175)"
          unit={reference ? "%" : unit ? ` ${unit}` : undefined}
        />
        <YAxis type="category" dataKey="label" width={122} tick={{ fontSize: 10 }} stroke="oklch(0.6 0.02 175)" interval={0} />
        <Tooltip content={<NutrientChartTooltip />} cursor={{ fill: "oklch(0.9 0.01 172 / 0.35)" }} />
        {reference && <ReferenceLine x={100} stroke="oklch(0.55 0.02 175)" strokeDasharray="4 3" />}
        <Bar dataKey="value" barSize={14} radius={[0, 3, 3, 0]}>
          {rows.map((row, i) => (
            <Cell key={i} fill={row.deficit ? "oklch(0.75 0.14 75)" : "oklch(0.6 0.13 175)"} />
          ))}
          <LabelList dataKey="text" position="right" style={{ fontSize: 9, fill: "currentColor" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function NutrientChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: NutrientChartRow }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-[11px] shadow-md">
      <div className="font-semibold">{row.label}</div>
      <div className="mt-0.5 text-muted-foreground">{row.tooltip}</div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""}`}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

function ResultStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-muted-foreground">
        <Icon className={`h-3 w-3 ${color}`} /> {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
