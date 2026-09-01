"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  FolderOpen,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { FoodCatalog } from "@/components/nutrition/food-catalog";
import { PatientPicker } from "@/components/nutrition/patient-picker";
import { RationAddDialog } from "@/components/nutrition/ration-add-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type AssessmentRecord,
  type AssessmentEnergyRecord,
  type AssessmentRequestPayload,
  type AssessmentStatus,
  type DietPlanRecord,
  type DietPlanSummaryRecord,
  type FeedForm,
  type FoodRecord,
  type FoodSummaryRecord,
  type PatientRecord,
  type NutrientCategory,
  type NutrientRecord,
} from "@/lib/api-client";
import {
  useActiveGuidelineQuery,
  useAssessmentSuggestions,
  useCreateAssessment,
  useCreateDietPlan,
  useDietPlanQuery,
  useDietPlansQuery,
  useEnergyEstimate,
  useFoodEnergyValues,
  useNutrientsQuery,
  usePatientQuery,
  useUpdateDietPlan,
} from "@/lib/hooks";
import {
  apiErrorMessage,
  LIFE_STAGE_OPTIONS,
  ACTIVITY_OPTIONS,
  SPECIES_OPTIONS,
} from "@/lib/patient-form";
import {
  defaultRerFactor,
  assessmentAnimalToNutritionForm,
  emptyNutritionAnimal,
  inferFeedForm,
  patientToNutritionAnimal,
  planToRationLines,
  toAssessmentAnimal,
  type NutritionAnimalForm,
  type RationLine,
} from "@/lib/nutrition-workspace";
import {
  canonicalNutrientCode,
  NUTRIENT_COLUMNS,
  orderedNutrients,
} from "@/lib/nutrient-columns";
import { cn } from "@/lib/utils";

const STATUS: Record<AssessmentStatus, { label: string; symbol: string; className: string }> = {
  met: { label: "Соответствует", symbol: "✓", className: "text-emerald-700 dark:text-emerald-300" },
  below_minimum: { label: "Ниже минимума", symbol: "↓", className: "text-amber-800 dark:text-amber-300" },
  above_maximum: { label: "Выше максимума", symbol: "↑", className: "text-red-700 dark:text-red-300" },
  not_established: { label: "Невозможно оценить", symbol: "?", className: "text-violet-700 dark:text-violet-300" },
  not_applicable: { label: "Не применимо", symbol: "—", className: "text-muted-foreground" },
  insufficient_context: { label: "Недостаточно контекста", symbol: "?", className: "text-violet-700 dark:text-violet-300" },
  missing_product_data: { label: "Нет данных продукта", symbol: "?", className: "text-violet-700 dark:text-violet-300" },
};

function formatNumber(value: number | null, digits = 2): string {
  return value == null ? "—" : value.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

function resolvedStandardLabel(code: string | null | undefined, edition = "2025"): string {
  const labels: Record<string, string> = {
    dog_adult_maintenance: "Взрослая собака · суточные минимумы",
    dog_adult_mer95: "Взрослая собака · MER 95 · низкая активность",
    dog_adult_mer110: "Взрослая собака · MER 110",
    cat_adult_maintenance: "Взрослая кошка · суточные минимумы",
    cat_adult_mer75: "Взрослая кошка · MER 75 · домашняя и/или стерилизованная",
    cat_adult_mer100: "Взрослая кошка · MER 100 · активная",
    dog_early_growth_reproduction: "Собака · ранний рост / репродукция",
    dog_late_growth: "Собака · поздний рост",
    cat_growth: "Кошка · рост",
    cat_reproduction: "Кошка · репродукция",
  };
  return code ? `FEDIAF ${edition} · ${labels[code] ?? "стандарт по выбранному контексту"}` : `FEDIAF ${edition} · определяется сервером`;
}

function humanFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    body_weight_kg: "текущая масса",
    current_body_weight_kg: "текущая масса",
    age_months: "возраст",
    expected_adult_weight_kg: "ожидаемый взрослый вес",
    expected_mature_weight_kg: "ожидаемый взрослый вес",
    maintenance_energy_kcal_day: "базовый MER",
    lactation_week: "неделя лактации",
    litter_size: "размер помёта",
  };
  return labels[field] ?? "дополнительные данные пациента";
}

function rationKcalTotal(lines: RationLine[], energyValues: Record<string, number | null>): number | null {
  if (!lines.length) return null;
  let total = 0;
  for (const line of lines) {
    const grams = Number(line.grams.replace(",", "."));
    const density = energyValues[line.food.uuid];
    if (density == null || !Number.isFinite(grams) || grams <= 0) return null;
    total += density * grams / 100;
  }
  return total;
}

const CURRENT_NUTRITION_ENGINE_ID = "nutrition-engine/2.0.0";

export function NutritionWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId") ?? "";
  const planId = searchParams.get("planId") ?? "";
  const patient = usePatientQuery(patientId);
  const plan = useDietPlanQuery(planId);
  const recentPlans = useDietPlansQuery();
  const guideline = useActiveGuidelineQuery(!planId);
  const assessment = useCreateAssessment();
  const createPlan = useCreateDietPlan();
  const updatePlan = useUpdateDietPlan();
  const [animal, setAnimal] = React.useState<NutritionAnimalForm>(emptyNutritionAnimal);
  const [hydratedPatientId, setHydratedPatientId] = React.useState<string | null>(null);
  const [hydratedPlanId, setHydratedPlanId] = React.useState<string | null>(null);
  const [historicalRecalculationStarted, setHistoricalRecalculationStarted] = React.useState(false);
  const [rerFactor, setRerFactor] = React.useState("1.6");
  const [energyAdjustmentPercent, setEnergyAdjustmentPercent] = React.useState("100");
  const [lines, setLines] = React.useState<RationLine[]>([]);
  const [rationAddOpen, setRationAddOpen] = React.useState(false);
  const [feedOverride, setFeedOverride] = React.useState<"auto" | "dry" | "wet">("auto");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [assessmentDirty, setAssessmentDirty] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [planName, setPlanName] = React.useState("План 1");
  const [planNotes, setPlanNotes] = React.useState("");
  const [selectedPatientId, setSelectedPatientId] = React.useState<string>(patientId);
  const selectedPatient = usePatientQuery(selectedPatientId);
  const assessmentAnimal = React.useMemo(() => {
    try {
      return toAssessmentAnimal(animal);
    } catch {
      return null;
    }
  }, [animal]);
  const suggestions = useAssessmentSuggestions(assessmentAnimal);
  const showExpectedMatureWeight = animal.species === "dog";
  const adjustmentValue = Number(energyAdjustmentPercent.replace(",", "."));
  const energyEstimate = useEnergyEstimate(assessmentAnimal && Number.isFinite(adjustmentValue) && adjustmentValue > 0 ? {
    animal: assessmentAnimal,
    energy_adjustment_percent: adjustmentValue,
  } : null);
  const foodEnergy = useFoodEnergyValues(lines.map((line) => line.food.uuid));
  const nutrients = useNutrientsQuery();
  const historicalPlan = Boolean(plan.data && (
    plan.data.engine_id !== CURRENT_NUTRITION_ENGINE_ID
    || !plan.data.assessment_snapshot.assessment.input_hash
  ));
  const historicalSnapshotLocked = historicalPlan && !historicalRecalculationStarted;

  React.useEffect(() => {
    setHydratedPlanId(null);
    setHistoricalRecalculationStarted(false);
  }, [planId]);

  React.useEffect(() => {
    const storedPlan = plan.data;
    if (!storedPlan || hydratedPlanId === storedPlan.uuid) return;
    const request = storedPlan.assessment_snapshot.request;
    const rationLines = planToRationLines(storedPlan);
    setAnimal(assessmentAnimalToNutritionForm(request.animal));
    setLines(rationLines);
    setRerFactor(String(request.rer_factor));
    setEnergyAdjustmentPercent(String(request.energy_adjustment_percent ?? 100));
    setHistoricalRecalculationStarted(false);
    const inferred = inferFeedForm(rationLines);
    setFeedOverride(request.feed_form === "unknown" || request.feed_form === inferred
      ? "auto"
      : request.feed_form);
    setPlanName(storedPlan.name);
    setPlanNotes(storedPlan.notes ?? "");
    setSelectedPatientId(storedPlan.patient_uuid ?? "");
    setHydratedPatientId(storedPlan.patient_uuid);
    assessment.reset();
    setAssessmentDirty(false);
    setFormError(null);
    setHydratedPlanId(storedPlan.uuid);
  }, [assessment, hydratedPlanId, plan.data]);

  React.useEffect(() => {
    if (planId) return;
    if (!patientId) {
      if (hydratedPatientId) {
        setAnimal(emptyNutritionAnimal());
        setRerFactor("1.6");
        setEnergyAdjustmentPercent("100");
        assessment.reset();
        setAssessmentDirty(false);
      }
      setHydratedPatientId(null);
      setSelectedPatientId("");
      return;
    }
    if (!patient.data || patient.data.uuid !== patientId) return;
    if (hydratedPatientId === patient.data.uuid) return;
    setAnimal(patientToNutritionAnimal(patient.data));
    setRerFactor(String(defaultRerFactor(patient.data.species, patient.data.neutered)));
    setEnergyAdjustmentPercent("100");
    assessment.reset();
    setAssessmentDirty(false);
    setSelectedPatientId(patient.data.uuid);
    setHydratedPatientId(patient.data.uuid);
  }, [assessment, hydratedPatientId, patient.data, patientId, planId]);

  const replacePatientQuery = React.useCallback((nextPatientId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPatientId) params.set("patientId", nextPatientId);
    else params.delete("patientId");
    const query = params.toString();
    router.replace(query ? `/nutrition?${query}` : "/nutrition");
  }, [router, searchParams]);

  const handlePatientChange = React.useCallback((nextPatientId: string) => {
    if (nextPatientId === selectedPatientId) return;
    setSelectedPatientId(nextPatientId);
    if (planId) return;
    replacePatientQuery(nextPatientId);
    setEnergyAdjustmentPercent("100");
    assessment.reset();
    setAssessmentDirty(false);
    setFormError(null);
    if (!nextPatientId) {
      setAnimal(emptyNutritionAnimal());
      setRerFactor("1.6");
      setHydratedPatientId(null);
    }
  }, [assessment, planId, replacePatientQuery, selectedPatientId]);

  const invalidateAssessment = React.useCallback(() => {
    setAssessmentDirty(true);
  }, []);

  function patchAnimal(patch: Partial<NutritionAnimalForm>) {
    setAnimal((current) => ({ ...current, ...patch }));
    const keys = Object.keys(patch) as (keyof NutritionAnimalForm)[];
    const invalidates = keys.some((key) => key !== "bcs");
    if (invalidates) invalidateAssessment();
  }

  function startCurrentVersionRecalculation() {
    assessment.reset();
    setAssessmentDirty(false);
    setFormError(null);
    setHistoricalRecalculationStarted(true);
  }

  function addFood(food: FoodSummaryRecord) {
    setLines((current) => current.some((line) => line.food.uuid === food.uuid)
      ? current
      : [...current, { food, grams: "100" }]);
    invalidateAssessment();
  }

  function setLineGrams(foodId: string, grams: string) {
    setLines((current) => current.map((line) => line.food.uuid === foodId ? { ...line, grams } : line));
    invalidateAssessment();
  }

  const inferredFeedForm = inferFeedForm(lines);
  const effectiveFeedForm: FeedForm = feedOverride === "auto" ? inferredFeedForm : feedOverride;

  function buildAssessmentRequest(): AssessmentRequestPayload {
    const components = lines.map((line) => ({
      food_uuid: line.food.uuid,
      grams: Number(line.grams.trim().replace(",", ".")),
    }));
    if (!components.length || components.some((item) => !Number.isFinite(item.grams) || item.grams <= 0)) {
      throw new Error("Добавьте продукты и укажите массу каждого компонента больше 0 г");
    }
    const factor = Number(rerFactor.replace(",", "."));
    if (!Number.isFinite(factor) || factor <= 0) throw new Error("Проверьте коэффициент RER");
    const adjustment = Number(energyAdjustmentPercent.trim().replace(",", "."));
    if (!Number.isFinite(adjustment) || adjustment <= 0 || adjustment > 300) {
      throw new Error("Корректировка энергии должна быть от 0 до 300%");
    }
    return {
      animal: toAssessmentAnimal(animal),
      feed_form: effectiveFeedForm,
      therapeutic_goal: false,
      rer_factor: factor,
      energy_adjustment_percent: adjustment,
      ration_species_mismatch_confirmed: false,
      components,
    };
  }

  async function saveDietPlan() {
    setFormError(null);
    try {
      if (planId && (
        !assessment.data
        || assessmentDirty
        || assessment.data.engine_id !== CURRENT_NUTRITION_ENGINE_ID
        || !assessment.data.input_hash
      )) {
        throw new Error("Сначала выполните актуальную оценку по текущей версии nutrition engine");
      }
      const payload = {
        name: planName.trim(),
        patient_uuid: selectedPatientId || null,
        notes: planNotes.trim() || null,
        assessment_request: buildAssessmentRequest(),
      };
      if (!payload.name) throw new Error("Введите название плана");
      const saved = planId
        ? await updatePlan.mutateAsync({ id: planId, body: payload })
        : await createPlan.mutateAsync(payload);
      setAssessmentDirty(false);
      setSaveOpen(false);
      toast.success(planId ? "Snapshot плана заменён" : "План сохранён", {
        description: saved.name,
      });
      if (!planId) router.replace(`/nutrition?planId=${saved.uuid}`);
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    }
  }

  const storedAssessment = assessment.data
    ?? (planId ? plan.data?.assessment_snapshot.assessment : undefined);
  const displayedAssessment = React.useMemo<AssessmentRecord | undefined>(() => {
    if (!storedAssessment) return undefined;
    if (planId && !assessment.data) return storedAssessment;
    const weight = Number(animal.currentBodyWeightKg.replace(",", "."));
    const factor = Number(rerFactor.replace(",", "."));
    const rer = Number.isFinite(weight) && weight > 0 ? 70 * weight ** 0.75 : null;
    return {
      ...storedAssessment,
      energy: {
        ...storedAssessment.energy,
        rer_kcal_day: rer,
        rer_factor: Number.isFinite(factor) && factor > 0 ? factor : storedAssessment.energy.rer_factor,
        rer_factor_kcal_day: rer != null && Number.isFinite(factor) && factor > 0
          ? rer * factor
          : null,
      },
    };
  }, [animal.currentBodyWeightKg, assessment.data, planId, rerFactor, storedAssessment]);
  const rationKcal = React.useMemo(
    () => rationKcalTotal(lines, foodEnergy.data),
    [foodEnergy.data, lines],
  );
  const resolvedProfileCode = displayedAssessment?.context.nutrient_profile_code
    ?? suggestions.data?.suggested_profile_code;
  const resolvedFormulaCode = displayedAssessment?.context.energy_formula_code
    ?? suggestions.data?.suggested_energy_formula_code;
  const resolvedFormulaName = suggestions.data?.energy_formula_options.find(
    (item) => item.code === resolvedFormulaCode,
  )?.name_ru ?? null;
  const resolvedEnergy = displayedAssessment?.energy;
  const workingEnergyKcal = resolvedEnergy?.working_energy_kcal
    ?? energyEstimate.data?.working_energy_kcal
    ?? null;
  const automaticAssessmentKey = React.useMemo(() => JSON.stringify({
    animal,
    rerFactor,
    energyAdjustmentPercent,
    feedOverride,
    lines: lines.map((line) => [line.food.uuid, line.grams]),
  }), [
    animal,
    energyAdjustmentPercent,
    feedOverride,
    lines,
    rerFactor,
  ]);
  const lastAutomaticAssessmentKey = React.useRef("");

  React.useEffect(() => {
    if (historicalSnapshotLocked || automaticAssessmentKey === lastAutomaticAssessmentKey.current) return;
    if (planId && !assessmentDirty && !historicalRecalculationStarted) {
      lastAutomaticAssessmentKey.current = automaticAssessmentKey;
      return;
    }

    let payload: AssessmentRequestPayload;
    try {
      payload = buildAssessmentRequest();
    } catch {
      return;
    }

    lastAutomaticAssessmentKey.current = automaticAssessmentKey;
    const timer = window.setTimeout(() => {
      setFormError(null);
      void assessment.mutateAsync(payload)
        .then((accepted) => {
          if (accepted) setAssessmentDirty(false);
        })
        .catch((cause) => setFormError(apiErrorMessage(cause)));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [automaticAssessmentKey, assessment.mutateAsync, assessmentDirty, historicalRecalculationStarted, historicalSnapshotLocked, planId]);

  React.useEffect(() => {
    if (
      planId
      || !assessment.data
      || !guideline.data
      || (
        assessment.data.edition.code === guideline.data.code
        && assessment.data.edition.source_checksum === guideline.data.source_checksum
      )
    ) return;
    setAssessmentDirty(true);
  }, [assessment.data, guideline.data, planId]);

  if (planId && plan.isPending) {
    return <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8" aria-busy="true"><Skeleton className="h-10 w-80" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (planId && plan.isError) {
    return <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8"><p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{apiErrorMessage(plan.error)}</p><Button asChild variant="outline"><Link href="/nutrition"><FolderOpen className="h-4 w-4" />Открыть недавние планы</Link></Button></div>;
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-[1600px] space-y-3 overflow-x-hidden p-3 sm:p-4 lg:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-[-0.02em] sm:text-2xl">{plan.data?.name ?? "Питание / Расчёт рациона"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.data ? `Сохранённый план · FEDIAF ${plan.data.edition_code}` : "Рабочее место ветеринарного диетолога · автоматический пересчёт"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setSaveOpen(true)}
          disabled={planId
            ? historicalSnapshotLocked || !assessment.data || assessmentDirty
            : !assessment.data}
        >
          {planId ? <RefreshCw className="size-4" /> : <Save className="size-4" />}
          {planId ? "Пересчитать и сохранить" : "Сохранить план"}
        </Button>
      </div>

      <Tabs defaultValue="assessment" className="space-y-3">
        <TabsList className="h-9 rounded-lg p-1">
          <TabsTrigger value="assessment" className="h-7 rounded-md px-3 text-xs">Рацион</TabsTrigger>
          <TabsTrigger value="plans" className="h-7 rounded-md px-3 text-xs">Недавние планы</TabsTrigger>
          <TabsTrigger value="catalog" className="h-7 rounded-md px-3 text-xs">Каталог</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" data-catalog-workbench><FoodCatalog /></TabsContent>
        <TabsContent value="plans"><RecentPlans plans={recentPlans.data ?? []} pending={recentPlans.isPending} error={recentPlans.isError ? apiErrorMessage(recentPlans.error) : null} /></TabsContent>
        <TabsContent value="assessment" className="space-y-3">
          {plan.data ? (
            <SnapshotNotice
              plan={plan.data}
              historical={historicalPlan}
              recalculationStarted={historicalRecalculationStarted}
              onStartCurrentRecalculation={startCurrentVersionRecalculation}
            />
          ) : <GuidelineWarning guideline={guideline} />}

          <fieldset disabled={historicalSnapshotLocked} className="min-w-0 space-y-3">
            <ClinicalContextSummary
              animal={animal}
              patient={selectedPatient.data ?? null}
              selectedPatientId={selectedPatientId}
              selectedPatientPending={Boolean(selectedPatientId) && selectedPatient.isPending}
              onPatientChange={handlePatientChange}
              patientError={patientId && patient.isError ? apiErrorMessage(patient.error) : null}
              standard={resolvedStandardLabel(
                resolvedProfileCode,
                displayedAssessment?.edition.code ?? suggestions.data?.edition.code ?? guideline.data?.code ?? "2025",
              )}
              edition={displayedAssessment?.edition.code ?? guideline.data?.code ?? "2025"}
              standardPending={suggestions.isPending}
              standardError={suggestions.isError ? apiErrorMessage(suggestions.error) : null}
            >
              <AnimalContextPanel
                animal={animal}
                disabled={historicalSnapshotLocked || (Boolean(patientId) && patient.isPending)}
                onPatch={patchAnimal}
                showExpectedMatureWeight={showExpectedMatureWeight}
                adjustment={energyAdjustmentPercent}
                onAdjustment={(value) => {
                  setEnergyAdjustmentPercent(value);
                  invalidateAssessment();
                }}
                rerFactor={rerFactor}
                onRerFactor={setRerFactor}
              />

              <EnergyStrip
                estimate={energyEstimate}
                assessmentEnergy={resolvedEnergy}
                formulaName={resolvedFormulaName}
                adjustment={energyAdjustmentPercent}
                rerFactor={rerFactor}
                currentBodyWeightKg={animal.currentBodyWeightKg}
              />
            </ClinicalContextSummary>

            {formError ? <p className="rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{formError}</p> : null}

            <RationWorkbench
              lines={lines}
              onOpenAdd={() => setRationAddOpen(true)}
              onGrams={setLineGrams}
              onRemove={(id) => { setLines((current) => current.filter((line) => line.food.uuid !== id)); invalidateAssessment(); }}
              inferredFeedForm={inferredFeedForm}
              feedOverride={feedOverride}
              onFeedOverride={(value) => { setFeedOverride(value); invalidateAssessment(); }}
              assessment={displayedAssessment}
              assessmentPending={assessment.isPending}
              dirty={assessmentDirty}
              workingEnergyKcal={workingEnergyKcal}
              rationKcal={rationKcal}
              foodRecords={foodEnergy.foods}
              nutrients={nutrients.data ?? []}
              foodDataPending={foodEnergy.isPending}
            />
          </fieldset>
        </TabsContent>
      </Tabs>
      <SavePlanDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        editing={Boolean(planId)}
        name={planName}
        notes={planNotes}
        patientId={selectedPatientId}
        selectedPatient={selectedPatient.data ?? null}
        selectedPatientPending={Boolean(selectedPatientId) && selectedPatient.isPending}
        pending={createPlan.isPending || updatePlan.isPending}
        onName={setPlanName}
        onNotes={setPlanNotes}
        onPatientId={handlePatientChange}
        onSave={() => void saveDietPlan()}
      />
      <RationAddDialog
        open={rationAddOpen}
        onOpenChange={setRationAddOpen}
        existingFoodIds={lines.map((line) => line.food.uuid)}
        onAdd={addFood}
      />
    </div>
  );
}

function SnapshotNotice({ plan, historical, recalculationStarted, onStartCurrentRecalculation }: {
  plan: DietPlanRecord;
  historical: boolean;
  recalculationStarted: boolean;
  onStartCurrentRecalculation: () => void;
}) {
  return (
    <div className="rounded-lg border border-sky-300/70 bg-sky-50/70 px-3 py-2 text-xs text-sky-950 dark:bg-sky-950/25 dark:text-sky-200">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex items-center gap-1.5 font-semibold"><Save className="size-3.5" /> Сохранённый расчёт</span><span>FEDIAF {plan.edition_code}</span><span>{historical ? "Предыдущая методика расчёта" : "Без пересчёта при открытии"}</span></div>
      {historical && !recalculationStarted ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-sky-300/50 pt-2">
          <Button type="button" size="sm" onClick={onStartCurrentRecalculation}>
            <RefreshCw className="h-4 w-4" />
            Пересчитать по текущей версии
          </Button>
          <p>Сервер заново определит стандарт, энергетическую формулу и рабочую энергию.</p>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px]">
          {recalculationStarted
            ? "Текущий snapshot не изменится до явного сохранения нового расчёта."
            : "Snapshot заменяется только действием «Пересчитать и сохранить»."}
        </p>
      )}
    </div>
  );
}

function RecentPlans({ plans, pending, error }: {
  plans: DietPlanSummaryRecord[];
  pending: boolean;
  error: string | null;
}) {
  if (pending) return <Skeleton className="h-40 w-full" />;
  if (error) return <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{error}</p>;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Недавние планы</CardTitle><CardDescription>Не более 50 планов, включая ручные профили без Patient.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {plans.map((item) => <Link key={item.uuid} href={`/nutrition?planId=${item.uuid}`} className="flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"><span><strong>{item.name}</strong><span className="ml-2 text-xs text-muted-foreground">{item.patient?.name ?? "без пациента"}</span></span><span className="text-xs text-muted-foreground">FEDIAF {item.edition_code}</span></Link>)}
        {!plans.length ? <p className="py-6 text-center text-sm text-muted-foreground">Сохранённых планов пока нет</p> : null}
      </CardContent>
    </Card>
  );
}

function SavePlanDialog({ open, onOpenChange, editing, name, notes, patientId, selectedPatient, selectedPatientPending, pending, onName, onNotes, onPatientId, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  name: string;
  notes: string;
  patientId: string;
  selectedPatient: PatientRecord | null;
  selectedPatientPending: boolean;
  pending: boolean;
  onName: (value: string) => void;
  onNotes: (value: string) => void;
  onPatientId: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Пересчитать и сохранить" : "Сохранить план"}</DialogTitle><DialogDescription>{editing ? "Текущий snapshot будет заменён результатом нового серверного расчёта. История версий не создаётся." : "Сервер повторно проверит контекст и рассчитает snapshot перед записью."}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label="Название"><Input value={name} onChange={(event) => onName(event.target.value)} maxLength={255} /></Field>
          <Field label="Пациент (необязательно)">
            <PatientPicker
              value={patientId}
              selected={selectedPatient}
              selectedPending={selectedPatientPending}
              onChange={onPatientId}
            />
          </Field>
          <Field label="Заметки"><Textarea value={notes} onChange={(event) => onNotes(event.target.value)} rows={4} /></Field>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Отмена</Button><Button type="button" onClick={onSave} disabled={pending || !name.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <RefreshCw className="h-4 w-4" /> : <Save className="h-4 w-4" />}{editing ? "Пересчитать и сохранить" : "Сохранить план"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GuidelineWarning({ guideline }: { guideline: ReturnType<typeof useActiveGuidelineQuery> }) {
  if (guideline.isPending) return <Skeleton className="h-9 w-full" />;
  if (guideline.isError) return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
      Обязательное клиническое предупреждение недоступно: {apiErrorMessage(guideline.error)}
    </div>
  );
  return (
    <details className="rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><AlertTriangle className="size-3.5" /> Клиническое предупреждение · FEDIAF {guideline.data?.code}</summary>
      <p className="mt-2 max-w-5xl border-t border-amber-300/50 pt-2">{guideline.data?.clinical_warning_ru}</p>
    </details>
  );
}

function ClinicalContextSummary({
  animal,
  patient,
  selectedPatientId,
  selectedPatientPending,
  onPatientChange,
  patientError,
  standard,
  edition,
  standardPending,
  standardError,
  children,
}: {
  animal: NutritionAnimalForm;
  patient: PatientRecord | null;
  selectedPatientId: string;
  selectedPatientPending: boolean;
  onPatientChange: (value: string) => void;
  patientError: string | null;
  standard: string | null;
  edition: string;
  standardPending: boolean;
  standardError: string | null;
  children: React.ReactNode;
}) {
  const species = SPECIES_OPTIONS.find((item) => item.value === animal.species)?.label ?? animal.species;
  const lifeStage = LIFE_STAGE_OPTIONS.find((item) => item.value === animal.lifeStage)?.label ?? "Стадия не указана";
  const currentWeight = Number(animal.currentBodyWeightKg.replace(",", "."));
  const targetWeight = Number(animal.targetBodyWeightKg.replace(",", "."));
  const weightText = Number.isFinite(currentWeight) && currentWeight > 0
    ? `${formatNumber(currentWeight, 1)} кг${Number.isFinite(targetWeight) && targetWeight > 0 ? ` → ${formatNumber(targetWeight, 1)} кг` : ""}`
    : "масса не указана";
  const ageText = animal.ageMonths && Number.isFinite(Number(animal.ageMonths.replace(",", ".")))
    ? `${formatNumber(Number(animal.ageMonths.replace(",", ".")), 0)} мес`
    : "возраст —";
  const bcsText = animal.bcs ? `BCS ${animal.bcs}/9` : "BCS не указан";

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-background" aria-label="Параметры расчёта питания">
      <div className="border-b bg-muted/15 px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <PatientPicker
            id="nutrition-patient-picker"
            value={selectedPatientId}
            selected={patient}
            selectedPending={selectedPatientPending}
            onChange={onPatientChange}
            compact
            className="h-7 w-auto max-w-[14rem] border-transparent bg-transparent px-0 font-semibold shadow-none hover:bg-transparent hover:text-primary"
          />
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span>{species}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span>{ageText}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span>{weightText}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span>{bcsText}</span>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs">
          {standardPending ? <Skeleton className="h-4 w-64" /> : (
            <span className="min-w-0 truncate font-medium text-foreground">{standard ?? `FEDIAF ${edition} · определяется сервером`}</span>
          )}
          <Badge variant="secondary" className="h-5 shrink-0 rounded px-1.5 text-[10px] font-semibold">Авто</Badge>
          <span className="text-muted-foreground">· {lifeStage}</span>
        </div>
        {patientError ? <p className="mt-2 text-xs text-destructive" role="alert">{patientError}</p> : null}
        {standardError ? <p className="mt-2 text-xs text-destructive" role="alert">{standardError}</p> : null}
      </div>
      <div className="grid min-w-0 xl:grid-cols-[minmax(0,2.1fr)_minmax(300px,1fr)]">{children}</div>
    </section>
  );
}

function AnimalContextPanel({ animal, disabled, onPatch, showExpectedMatureWeight, adjustment, onAdjustment, rerFactor, onRerFactor }: {
  animal: NutritionAnimalForm;
  disabled: boolean;
  onPatch: (patch: Partial<NutritionAnimalForm>) => void;
  showExpectedMatureWeight: boolean;
  adjustment: string;
  onAdjustment: (value: string) => void;
  rerFactor: string;
  onRerFactor: (value: string) => void;
}) {
  const showPregnancy = animal.lifeStage === "gestation" || animal.pregnant;
  const showLactation = animal.lifeStage === "lactation" || animal.lactating;
  return (
    <section className="min-w-0 px-4 py-5 sm:px-5 lg:px-6" aria-labelledby="clinical-context-details">
      <h2 id="clinical-context-details" className="text-base font-semibold tracking-[-0.01em]">Параметры</h2>
      <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-[13.75rem_14.5rem_8.75rem] lg:items-end lg:gap-x-2">
        <Field label="Вид">
          <Select value={animal.species} onValueChange={(species) => onPatch({ species: species as NutritionAnimalForm["species"] })} disabled={disabled}>
            <SelectTrigger className="w-full shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent>{SPECIES_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Стадия жизни">
          <Select value={animal.lifeStage || "none"} onValueChange={(value) => onPatch({ lifeStage: value === "none" ? "" : value })} disabled={disabled}>
            <SelectTrigger className="max-w-[22rem] shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Не указана</SelectItem>{LIFE_STAGE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Возраст">
          <UnitInput unit="мес" className="max-w-40" inputMode="decimal" value={animal.ageMonths} onChange={(event) => onPatch({ ageMonths: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Текущая масса">
          <UnitInput unit="кг" className="max-w-40" inputMode="decimal" value={animal.currentBodyWeightKg} onChange={(event) => onPatch({ currentBodyWeightKg: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Целевая масса">
          <UnitInput unit="кг" className="max-w-40" inputMode="decimal" value={animal.targetBodyWeightKg} onChange={(event) => onPatch({ targetBodyWeightKg: event.target.value })} disabled={disabled} />
        </Field>
        {showExpectedMatureWeight ? (
          <Field label="Ожидаемый взрослый вес">
            <UnitInput unit="кг" className="max-w-40" inputMode="decimal" value={animal.expectedMatureWeightKg} onChange={(event) => onPatch({ expectedMatureWeightKg: event.target.value })} disabled={disabled} />
          </Field>
        ) : <div className="hidden lg:block" aria-hidden="true" />}
        <Field label="BCS">
          <Select value={animal.bcs || "none"} onValueChange={(value) => onPatch({ bcs: value === "none" ? "" : value })} disabled={disabled}>
            <SelectTrigger className="max-w-40 shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Не указан</SelectItem>{Array.from({ length: 9 }, (_, index) => String(index + 1)).map((value) => <SelectItem key={value} value={value}>{value} / 9</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Активность">
          <Select value={animal.activity || "none"} onValueChange={(value) => onPatch({ activity: value === "none" ? "" : value })} disabled={disabled}>
            <SelectTrigger className="w-full shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Не указана</SelectItem>{ACTIVITY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Стерилизован">
          <div className="flex h-9 max-w-40 items-center rounded-md border border-input bg-background px-3">
            <CheckField label={animal.neutered ? "Да" : "Нет"} checked={animal.neutered} onChecked={(value) => onPatch({ neutered: value })} />
          </div>
        </Field>
        <Field label="Корректировка энергии">
          <UnitInput unit="%" className="max-w-44" inputMode="decimal" value={adjustment} onChange={(event) => onAdjustment(event.target.value)} />
        </Field>
        <Field label="Коэффициент RER">
          <Input className="h-9 max-w-40 shadow-none" inputMode="decimal" value={rerFactor} onChange={(event) => onRerFactor(event.target.value)} />
        </Field>
        {(showPregnancy || showLactation) ? (
          <div className="flex min-h-9 flex-wrap items-center gap-5 sm:pt-5">
            {showPregnancy ? <CheckField label="Беременность" checked={animal.pregnant} onChecked={(value) => onPatch({ pregnant: value })} /> : null}
            {showLactation ? <CheckField label="Лактация" checked={animal.lactating} onChecked={(value) => onPatch({ lactating: value })} /> : null}
          </div>
        ) : null}
        {animal.lactating ? <Field label="Неделя лактации"><Input className="h-9 max-w-40 shadow-none" inputMode="numeric" value={animal.lactationWeek} onChange={(event) => onPatch({ lactationWeek: event.target.value })} disabled={disabled} /></Field> : null}
        {animal.lactating ? <Field label="Размер помёта"><Input className="h-9 max-w-40 shadow-none" inputMode="numeric" value={animal.litterSize} onChange={(event) => onPatch({ litterSize: event.target.value })} disabled={disabled} /></Field> : null}
      </div>
    </section>
  );
}

function EnergyStrip({ estimate, assessmentEnergy, formulaName, adjustment, rerFactor, currentBodyWeightKg }: {
  estimate: ReturnType<typeof useEnergyEstimate>;
  assessmentEnergy: AssessmentEnergyRecord | undefined;
  formulaName: string | null;
  adjustment: string;
  rerFactor: string;
  currentBodyWeightKg: string;
}) {
  const workingEnergy = assessmentEnergy?.working_energy_kcal ?? estimate.data?.working_energy_kcal ?? null;
  const rangeMinimum = assessmentEnergy?.reference_energy_min_kcal
    ?? (estimate.data?.value?.kind === "range" ? estimate.data.value.min_kcal_day : null);
  const rangeMaximum = assessmentEnergy?.reference_energy_max_kcal
    ?? (estimate.data?.value?.kind === "range" ? estimate.data.value.max_kcal_day : null);
  const midpointRule = assessmentEnergy?.range_working_point_rule ?? estimate.data?.range_working_point_rule;
  const currentWeight = Number(currentBodyWeightKg.replace(",", "."));
  const localFactor = Number(rerFactor.replace(",", "."));
  const factor = assessmentEnergy?.rer_factor ?? localFactor;
  const calculatedRer = Number.isFinite(currentWeight) && currentWeight > 0 ? 70 * currentWeight ** 0.75 : null;
  const rer = assessmentEnergy?.rer_kcal_day ?? calculatedRer;
  const rerAdjusted = assessmentEnergy?.rer_factor_kcal_day
    ?? (rer != null && Number.isFinite(factor) && factor > 0 ? rer * factor : null);
  const adjustmentValue = Number(adjustment.replace(",", "."));
  const visibleMissingFields = Array.from(new Set((estimate.data?.missing_fields ?? []).map(humanFieldLabel)));
  return (
    <section className="min-w-0 border-t bg-muted/25 px-4 py-5 sm:px-5 lg:px-6 xl:border-l xl:border-t-0" aria-labelledby="energy-result-title" aria-live="polite">
      <h2 id="energy-result-title" className="text-base font-semibold tracking-[-0.01em]">Требования энергии</h2>
      {estimate.isPending && !assessmentEnergy ? <Skeleton className="mt-6 h-16 w-48" /> : (
        <div className="mt-4">
          {workingEnergy == null ? (
            <p className="max-w-64 text-lg font-semibold text-muted-foreground">Расчёт ещё не готов</p>
          ) : (
            <p className="tabular-nums text-[clamp(3.25rem,4vw,3.5rem)] font-bold leading-none tracking-[-0.035em] text-foreground">
              {formatNumber(workingEnergy, 0)}
              <span className="ml-2 inline-block text-base font-semibold tracking-normal text-muted-foreground">ккал/сут</span>
            </p>
          )}
          <p className="mt-3 text-sm font-medium leading-5">{formulaName ?? "Метод определяется по контексту пациента"}</p>
        </div>
      )}

      <dl className="mt-5 border-t pt-1 text-sm">
        <EnergyMetric
          label="RER"
          value={rer == null ? "—" : `${formatNumber(rer, 1)} ккал/сут`}
          formula={rer == null ? "Нужна текущая масса" : `70 × ${formatNumber(currentWeight, 1)}^0,75`}
        />
        <EnergyMetric
          label="MER"
          value={rerAdjusted == null ? "—" : `${formatNumber(rerAdjusted, 1)} ккал/сут`}
          formula={rer == null || !Number.isFinite(factor) || rerAdjusted == null
            ? "Нужны масса и коэффициент"
            : `${formatNumber(rer, 1)} × ${formatNumber(factor, 2)} = ${formatNumber(rerAdjusted, 1)}`}
        />
      </dl>

      <dl className="border-t pt-2 text-sm">
        <ResultMetric label="Корректировка энергии" value={Number.isFinite(adjustmentValue) ? `${formatNumber(adjustmentValue, 1)}%` : "—"} />
        <ResultMetric label="Итог" value={workingEnergy == null ? "—" : `${formatNumber(workingEnergy, 0)} ккал/сут`} strong />
      </dl>

      {rangeMinimum != null && rangeMaximum != null ? (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Диапазон {formatNumber(rangeMinimum, 0)}–{formatNumber(rangeMaximum, 0)} ккал/сут
          {midpointRule === "midpoint" ? " · рабочая точка — середина" : ""}
        </p>
      ) : null}
      {estimate.error ? <p className="mt-4 text-sm text-destructive">{apiErrorMessage(estimate.error)}</p> : null}
      {visibleMissingFields.length ? <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">Для расчёта нужны: {visibleMissingFields.join(", ")}.</p> : null}
    </section>
  );
}

function EnergyMetric({ label, value, formula }: { label: string; value: string; formula: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="row-span-2 text-right font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs tabular-nums text-muted-foreground">{formula}</dd>
    </div>
  );
}

function ResultMetric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong ? "font-bold text-foreground" : "font-semibold")}>{value}</dd>
    </div>
  );
}

type NutrientTableMode =
  | "deviations"
  | "control"
  | NutrientCategory
  | "derived";

type TableNutrient = {
  key: string;
  code: string;
  name: string;
  unit: string;
  category: NutrientCategory | "derived";
  derived: boolean;
  assessmentRow?: AssessmentRecord["rows"][number];
  assessmentRows?: AssessmentRecord["rows"];
};

const NUTRIENT_MODES: { value: NutrientTableMode; label: string }[] = [
  { value: "deviations", label: "Отклонения" },
  { value: "control", label: "Контрольные" },
  { value: "main", label: "Основные" },
  { value: "mineral", label: "Минералы" },
  { value: "vitamin", label: "Витамины" },
  { value: "amino_acid", label: "Аминокислоты" },
  { value: "fatty_acid", label: "Жирные кислоты" },
  { value: "derived", label: "Расчётные показатели" },
];

const CONTROL_NUTRIENT_CODE_SET = new Set(
  NUTRIENT_COLUMNS.control.map((column) => column.code),
);

const STATUS_PRIORITY: Record<AssessmentStatus, number> = {
  above_maximum: 0,
  below_minimum: 1,
  missing_product_data: 2,
  insufficient_context: 2,
  not_established: 2,
  met: 3,
  not_applicable: 4,
};

function isUnevaluableStatus(status: AssessmentStatus): boolean {
  return status === "missing_product_data"
    || status === "insufficient_context"
    || status === "not_established";
}

function isDeviationStatus(status: AssessmentStatus): boolean {
  return status === "above_maximum"
    || status === "below_minimum"
    || isUnevaluableStatus(status);
}

function foodCategoryLabel(line: RationLine): string {
  if (line.food.category) return line.food.category;
  if (line.food.type === "commercial") return "Корм";
  if (line.food.type === "supplement") return "Добавка";
  return "Продукт";
}

function RationWorkbench({
  lines,
  onOpenAdd,
  onGrams,
  onRemove,
  inferredFeedForm,
  feedOverride,
  onFeedOverride,
  assessment,
  assessmentPending,
  dirty,
  workingEnergyKcal,
  rationKcal,
  foodRecords,
  nutrients,
  foodDataPending,
}: {
  lines: RationLine[];
  onOpenAdd: () => void;
  onGrams: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  inferredFeedForm: FeedForm;
  feedOverride: "auto" | "dry" | "wet";
  onFeedOverride: (value: "auto" | "dry" | "wet") => void;
  assessment: AssessmentRecord | undefined;
  assessmentPending: boolean;
  dirty: boolean;
  workingEnergyKcal: number | null;
  rationKcal: number | null;
  foodRecords: Record<string, FoodRecord | undefined>;
  nutrients: NutrientRecord[];
  foodDataPending: boolean;
}) {
  const [mode, setMode] = React.useState<NutrientTableMode>("deviations");
  const [selectedFoodId, setSelectedFoodId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const rowRefs = React.useRef<Array<HTMLTableRowElement | null>>([]);
  const allTableNutrients = React.useMemo<TableNutrient[]>(() => {
    const groupedRows = new Map<string, AssessmentRecord["rows"]>();
    assessment?.rows.forEach((row) => {
      const key = `${row.derived ? "derived" : "atomic"}:${canonicalNutrientCode(row.code)}`;
      groupedRows.set(key, [...(groupedRows.get(key) ?? []), row]);
    });
    const selectAssessmentRow = (rows: AssessmentRecord["rows"] | undefined) => rows
      ? [...rows].sort((left, right) => {
        if (left.status === "not_applicable" && right.status !== "not_applicable") return 1;
        if (right.status === "not_applicable" && left.status !== "not_applicable") return -1;
        return STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
      })[0]
      : undefined;
    const atomicNutrients: TableNutrient[] = nutrients
      .filter((item) => item.is_active)
      .map((item) => {
        const code = canonicalNutrientCode(item.code);
        const rows = groupedRows.get(`atomic:${code}`);
        return {
          key: `catalog:${item.uuid}`,
          code: item.code,
          name: item.name,
          unit: item.base_unit,
          category: item.category,
          derived: false,
          assessmentRow: selectAssessmentRow(rows),
          assessmentRows: rows,
        };
      });
    const derivedNutrients: TableNutrient[] = Array.from(groupedRows).flatMap(([key, rows]) => {
      if (!key.startsWith("derived:")) return [];
      const assessmentRow = selectAssessmentRow(rows);
      if (!assessmentRow) return [];
      const code = canonicalNutrientCode(assessmentRow.code);
      return [{
        key,
        code,
        name: assessmentRow.name,
        unit: assessmentRow.unit,
        category: "derived" as const,
        derived: true,
        assessmentRow,
        assessmentRows: rows,
      }];
    });
    return [...atomicNutrients, ...derivedNutrients];
  }, [assessment, nutrients]);

  const controlTableNutrients = React.useMemo<TableNutrient[]>(() => (
    NUTRIENT_COLUMNS.control.map((column) => {
      const existing = allTableNutrients.find(
        (nutrient) => canonicalNutrientCode(nutrient.code) === column.code,
      );
      return existing ?? {
        key: `control:${column.code}`,
        code: column.code,
        name: column.name ?? column.code,
        unit: column.unit ?? "",
        category: "derived",
        derived: true,
      };
    })
  ), [allTableNutrients]);

  const nutrientsForMode = React.useCallback((nextMode: NutrientTableMode) => {
    if (nextMode === "deviations") {
      if (!assessment) {
        return controlTableNutrients;
      }
      return allTableNutrients
        .filter((item) => item.assessmentRow && isDeviationStatus(item.assessmentRow.status))
        .sort((a, b) => (
          STATUS_PRIORITY[a.assessmentRow?.status ?? "not_applicable"]
          - STATUS_PRIORITY[b.assessmentRow?.status ?? "not_applicable"]
        ));
    }
    if (nextMode === "control") {
      return controlTableNutrients;
    }
    const categoryNutrients = allTableNutrients.filter((item) => item.category === nextMode);
    if (nextMode === "main" || nextMode === "mineral" || nextMode === "vitamin") {
      return orderedNutrients(categoryNutrients, nextMode);
    }
    return categoryNutrients;
  }, [allTableNutrients, assessment, controlTableNutrients]);
  const visibleNutrients = nutrientsForMode(mode);

  const target = workingEnergyKcal ?? 0;
  const hasTarget = target > 0;
  const energyPercent = hasTarget && rationKcal != null ? rationKcal / target * 100 : null;
  const energyDifference = hasTarget && rationKcal != null ? rationKcal - target : null;
  const contextualFeedFormRequired = lines.length > 0 && inferredFeedForm === "unknown";
  const sources = assessment
    ? Array.from(new Map(assessment.rows.map((row) => {
      const key = [row.source.title, row.source.table, row.source.page, row.source.url].join("|");
      return [key, row.source] as const;
    })).values())
    : [];
  const missingFoods = assessment
    ? Array.from(new Set(assessment.rows.flatMap((row) => row.completeness.missing_food_names)))
    : [];

  function modeSummary(nextMode: NutrientTableMode): string {
    if (!assessment) return "—";
    const rows = nutrientsForMode(nextMode)
      .flatMap((item) => item.assessmentRows ?? (item.assessmentRow ? [item.assessmentRow] : []))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const deviations = rows.filter((row) => row.status === "above_maximum" || row.status === "below_minimum").length;
    const unknown = rows.filter((row) => isUnevaluableStatus(row.status)).length;
    if (deviations) return String(deviations) + "!";
    if (unknown) return String(unknown) + "?";
    return "✓";
  }

  function moveRowFocus(event: React.KeyboardEvent<HTMLTableRowElement>, index: number) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nextIndex = event.key === "ArrowDown"
      ? Math.min(lines.length - 1, index + 1)
      : Math.max(0, index - 1);
    rowRefs.current[nextIndex]?.focus();
    setSelectedFoodId(lines[nextIndex]?.food.uuid ?? null);
  }

  return (
    <Card className="min-w-0 overflow-hidden rounded-lg shadow-none">
      <div className="flex flex-col gap-2 border-b px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          <strong className="text-sm">
            {rationKcal == null ? "—" : formatNumber(rationKcal, 0)}
            {" / "}
            {hasTarget ? formatNumber(target, 0) : "—"} ккал
          </strong>
          <span className="text-muted-foreground">
            {energyPercent == null ? "покрытие —" : formatNumber(energyPercent, 0) + "%"}
          </span>
          <span className={cn(
            energyDifference != null && energyDifference < 0 ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground",
          )}>
            {energyDifference == null ? "разница —" : (energyDifference > 0 ? "+" : "") + formatNumber(energyDifference, 0) + " ккал"}
          </span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span className="text-emerald-700 dark:text-emerald-300">✓ {assessment?.met_count ?? 0} в норме</span>
          <span className="text-amber-800 dark:text-amber-300">↓ {assessment?.below_minimum_count ?? 0} дефицит</span>
          <span className="text-red-700 dark:text-red-300">↑ {assessment?.above_maximum_count ?? 0} избыток</span>
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            className="text-violet-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-violet-300"
          >
            ? {assessment?.unevaluable_count ?? 0} нет данных
          </button>
          {assessmentPending ? <span className="flex items-center gap-1.5 text-primary" role="status"><Loader2 className="size-3.5 animate-spin" />Пересчёт…</span> : dirty ? <span className="text-muted-foreground">Ожидание пересчёта</span> : null}
        </div>
        <Button type="button" size="sm" className="h-8 self-start rounded-md lg:self-auto" onClick={onOpenAdd}>
          <Plus className="size-4" />Добавить продукт
        </Button>
      </div>

      <div className="scrollbar-none flex gap-1 overflow-x-auto border-b bg-muted/30 px-2 py-1.5" role="tablist" aria-label="Группы нутриентов">
        {NUTRIENT_MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={mode === item.value}
            onClick={() => setMode(item.value)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === item.value
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
          >
            {item.label}
            <span className={cn(
              "min-w-4 text-center text-[10px] font-bold",
              modeSummary(item.value).includes("!") && "text-red-700 dark:text-red-300",
              modeSummary(item.value).includes("?") && "text-violet-700 dark:text-violet-300",
              modeSummary(item.value) === "✓" && "text-emerald-700 dark:text-emerald-300",
            )}>
              {modeSummary(item.value)}
            </span>
          </button>
        ))}
      </div>

      {assessment?.gate ? (
        <div className="flex items-start gap-2 border-b border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-200" role="alert">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span><strong>Нормативное сравнение остановлено.</strong> {assessment.gate.explanation_ru}</span>
        </div>
      ) : null}

      {contextualFeedFormRequired ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="size-3.5" />
          <span>Смешанный рацион: для оценки Se/Tau уточните форму корма.</span>
          <select
            value={feedOverride}
            onChange={(event) => onFeedOverride(event.target.value as "auto" | "dry" | "wet")}
            className="h-7 rounded-md border border-amber-400/70 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Форма корма для оценки селена и таурина"
          >
            <option value="auto">Не выбрана</option>
            <option value="dry">Сухая</option>
            <option value="wet">Влажная</option>
          </select>
        </div>
      ) : null}

      <div className="max-h-[calc(100dvh-20rem)] min-h-[22rem] overflow-auto scrollbar-thin">
        <table className="w-max min-w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-28" />
            <col className="w-64" />
            <col className="w-28" />
            {visibleNutrients.map((nutrient) => <col key={nutrient.key} className="w-24" />)}
          </colgroup>
          <thead className="sticky top-0 z-40 bg-muted text-muted-foreground">
            <tr className="h-11 border-b">
              <th scope="col" className="sticky left-0 top-0 z-50 w-28 min-w-28 border-r bg-muted px-2.5 text-left font-semibold">Категория</th>
              <th scope="col" className="sticky left-28 top-0 z-50 w-64 min-w-64 border-r bg-muted px-3 text-left font-semibold">Название</th>
              <th scope="col" className="sticky left-[23rem] top-0 z-50 w-28 min-w-28 border-r bg-muted px-2 text-right font-semibold">
                <span className="block">Количество</span>
                <span className="block text-[10px] font-normal">г/сут</span>
              </th>
              {visibleNutrients.map((nutrient) => (
                <th scope="col" key={nutrient.key} title={nutrient.assessmentRows && nutrient.assessmentRows.length > 1 ? `${canonicalNutrientCode(nutrient.code)} — ${nutrient.name} · норма зависит от контекста` : `${canonicalNutrientCode(nutrient.code)} — ${nutrient.name}`} className="w-24 min-w-24 border-r px-2 text-right font-semibold">
                  <span className="block text-foreground">{canonicalNutrientCode(nutrient.code)}</span>
                  <span className="block min-h-3.5 text-[10px] font-normal">{nutrient.unit || "\u00a0"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="h-9 border-b bg-slate-50/90 dark:bg-slate-900/40">
              <th className="sticky left-0 z-30 border-r bg-slate-50 px-2.5 text-left text-[11px] font-semibold dark:bg-slate-900">Цель</th>
              <th className="sticky left-28 z-30 border-r bg-slate-50 px-3 text-left font-semibold dark:bg-slate-900">FEDIAF {assessment?.edition.code ?? "2025"}</th>
              <td className="sticky left-[23rem] z-30 border-r bg-slate-50 dark:bg-slate-900" />
              {visibleNutrients.map((nutrient) => (
                <td key={nutrient.key} className="border-r px-2 text-right text-[11px]" title={nutrient.assessmentRows?.map((row) => targetText(row.target)).join(" · ") || "Цель ещё не рассчитана"}>
                  {nutrient.assessmentRows?.length && nutrient.assessmentRows.length > 1 && nutrient.assessmentRows.every((row) => row.status === "insufficient_context")
                    ? "уточнить"
                    : nutrient.assessmentRow ? targetValueText(nutrient.assessmentRow.target) : "—"}
                </td>
              ))}
            </tr>
            <tr className="h-10 border-b-2 border-primary/25 bg-emerald-50/70 font-semibold dark:bg-emerald-950/20">
              <th className="sticky left-0 z-30 border-r bg-emerald-50 px-2.5 text-left text-[11px] dark:bg-emerald-950">Итого</th>
              <th className="sticky left-28 z-30 border-r bg-emerald-50 px-3 text-left dark:bg-emerald-950">Рацион</th>
              <td className="sticky left-[23rem] z-30 border-r bg-emerald-50 px-2 text-right dark:bg-emerald-950">
                {lines.reduce((sum, line) => {
                  const grams = Number(line.grams.replace(",", "."));
                  return sum + (Number.isFinite(grams) ? grams : 0);
                }, 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
              </td>
              {visibleNutrients.map((nutrient) => {
                const row = nutrient.assessmentRow;
                const status = row ? STATUS[row.status] : null;
                const value = row?.ration_daily_amount
                  ?? row?.ration_per_1000_kcal_me
                  ?? rationNutrientValue(lines, foodRecords, nutrient);
                return (
                  <td
                    key={nutrient.key}
                    className={cn(
                      "border-r px-2 text-right",
                      status?.className,
                      row?.status === "above_maximum" && "bg-red-100/65 dark:bg-red-950/25",
                      row?.status === "below_minimum" && "bg-amber-100/70 dark:bg-amber-950/25",
                      row && isUnevaluableStatus(row.status) && "bg-violet-100/60 dark:bg-violet-950/25",
                    )}
                    title={status ? status.label : "Расчёт ещё не выполнен"}
                  >
                    {status ? <span className="mr-1" aria-hidden="true">{status.symbol}</span> : null}
                    {value == null ? "—" : formatNumber(value, 2)}
                  </td>
                );
              })}
            </tr>
            {lines.map((line, index) => (
              <tr
                key={line.food.uuid}
                ref={(node) => { rowRefs.current[index] = node; }}
                data-ration-row
                tabIndex={0}
                aria-selected={selectedFoodId === line.food.uuid}
                onClick={() => setSelectedFoodId(line.food.uuid)}
                onFocus={() => setSelectedFoodId(line.food.uuid)}
                onKeyDown={(event) => moveRowFocus(event, index)}
                className={cn(
                  "group h-11 border-b bg-card outline-none transition-colors hover:bg-accent/45 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  selectedFoodId === line.food.uuid && "bg-accent/70",
                )}
              >
                <td className={cn(
                  "sticky left-0 z-20 max-w-28 truncate border-r bg-card px-2.5 text-[11px] text-muted-foreground group-hover:bg-accent",
                  selectedFoodId === line.food.uuid && "bg-accent",
                )} title={foodCategoryLabel(line)}>
                  {foodCategoryLabel(line)}
                </td>
                <th className={cn(
                  "sticky left-28 z-20 border-r bg-card px-3 text-left font-medium group-hover:bg-accent",
                  selectedFoodId === line.food.uuid && "bg-accent",
                )} scope="row">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{line.food.name}</p>
                      <p className="truncate text-[10px] font-normal text-muted-foreground">
                        {line.food.subcategory ?? foodCategoryLabel(line)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(line.food.uuid);
                      }}
                      aria-label={"Удалить " + line.food.name}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </th>
                <td className={cn(
                  "sticky left-[23rem] z-20 border-r bg-card px-1.5 group-hover:bg-accent",
                  selectedFoodId === line.food.uuid && "bg-accent",
                )}>
                  <Input
                    aria-label={"Количество, г/сут: " + line.food.name}
                    inputMode="decimal"
                    value={line.grams}
                    onChange={(event) => onGrams(line.food.uuid, event.target.value)}
                    onFocus={() => setSelectedFoodId(line.food.uuid)}
                    className="h-8 rounded-md px-2 text-right text-xs tabular-nums"
                  />
                </td>
                {visibleNutrients.map((nutrient) => (
                  <td key={nutrient.key} className="border-r px-2 text-right">
                    {productNutrientValue(
                      foodRecords[line.food.uuid],
                      nutrient,
                      line.grams,
                      foodDataPending,
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!lines.length ? (
              <tr>
                <td colSpan={3 + Math.max(visibleNutrients.length, 1)} className="h-32 px-4 text-center">
                  <p className="font-medium">Рацион пока пуст</p>
                  <p className="mt-1 text-xs text-muted-foreground">Добавьте продукты — таблица и статусы обновятся автоматически.</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3 h-8" onClick={onOpenAdd}>
                    <Plus className="size-3.5" />Добавить продукт
                  </Button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {mode === "deviations" && assessment && visibleNutrients.length === 0 ? (
        <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <Check className="size-3.5" />В оценённых показателях отклонений нет.
        </div>
      ) : null}

      {detailsOpen ? (
        <div className="grid gap-3 border-t bg-muted/20 px-3 py-3 text-xs lg:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 font-semibold"><CircleHelp className="size-3.5 text-violet-600" />Почему данных недостаточно</p>
            <p className="mt-1 text-muted-foreground">
              {missingFoods.length
                ? "Неполный состав: " + missingFoods.join(", ") + ". Пустое значение трактуется как UNKNOWN, а не как 0."
                : "Пустое значение трактуется как UNKNOWN, а не как 0. Соответствие норме без исходных данных не подтверждается."}
            </p>
          </div>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold"><Info className="size-3.5 text-primary" />Источники и редакция</summary>
            <div className="mt-1 space-y-1 text-muted-foreground">
              {sources.slice(0, 4).map((source, index) => (
                <p key={source.title + String(index)}>{source.title} · {source.table ?? "таблица —"} · стр. {source.page ?? "—"}</p>
              ))}
              {assessment ? <p>FEDIAF {assessment.edition.code} · покрытие {formatNumber(assessment.coverage.percent, 1)}%</p> : null}
            </div>
          </details>
        </div>
      ) : null}
    </Card>
  );
}

function productNutrientValue(
  food: FoodRecord | undefined,
  nutrient: TableNutrient,
  gramsText: string,
  pending: boolean,
): React.ReactNode {
  if (!food) return pending ? "…" : <span className="text-violet-700 dark:text-violet-300" title="Нет данных">?</span>;
  const grams = Number(gramsText.replace(",", "."));
  if (!Number.isFinite(grams) || grams <= 0) return "—";
  const code = canonicalNutrientCode(nutrient.code);
  if (CONTROL_NUTRIENT_CODE_SET.has(code)) {
    const value = controlNutrientValue(code, (atomicCode) => foodNutrientAsFedValue(food, atomicCode));
    if (value == null) return <span className="text-muted-foreground">—</span>;
    return <span title={`${nutrient.name}: ${formatNumber(value, 3)}${nutrient.unit ? ` ${nutrient.unit}` : ""}`}>{formatNumber(value, 2)}</span>;
  }
  if (nutrient.derived) return <span className="text-muted-foreground">—</span>;
  const sourceValue = foodNutrientAsFedValue(food, code);
  if (sourceValue == null) {
    return <span className="text-violet-700 dark:text-violet-300" title="Нет данных продукта">?</span>;
  }
  const contribution = sourceValue * grams / 100;
  const sourceUnit = code === "ME" ? "ккал / 100 г" : `${nutrient.unit} / 100 г`;
  return <span title={`${formatNumber(sourceValue, 3)} ${sourceUnit}`}>{formatNumber(contribution, 2)}</span>;
}

function foodNutrientAsFedValue(food: FoodRecord, code: string): number | null {
  const source = food.nutrient_values.find(
    (item) => canonicalNutrientCode(item.code) === code && item.basis === "per_100g_as_fed",
  );
  if (!source || source.value == null || source.value_status === "unknown") return null;
  return source.value;
}

function safeRatio(numerator: number | null, denominator: number | null, factor = 1): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator * factor;
}

function knownSum(codes: readonly string[], valueFor: (code: string) => number | null): number | null {
  const values = codes.map(valueFor).filter((value): value is number => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function controlNutrientValue(
  code: string,
  valueFor: (code: string) => number | null,
): number | null {
  switch (code) {
    case "ME/DM":
      return safeRatio(valueFor("ME"), valueFor("DM"), 100);
    case "CP/ME":
      return safeRatio(valueFor("CP"), valueFor("ME"), 1000);
    case "CP/DM":
      return safeRatio(valueFor("CP"), valueFor("DM"), 100);
    case "CH/DM":
      return safeRatio(valueFor("CH"), valueFor("DM"), 100);
    case "CFa/DM":
      return safeRatio(valueFor("CFa"), valueFor("DM"), 100);
    case "CFi/DM":
      return safeRatio(valueFor("CFi"), valueFor("DM"), 100);
    case "CAs/DM":
      return safeRatio(valueFor("CAs"), valueFor("DM"), 100);
    case "Ca/P":
      return safeRatio(valueFor("Ca"), valueFor("P"));
    case "Zn/Ca":
      return safeRatio(valueFor("Zn"), valueFor("Ca"));
    case "ω6/ω3":
      return safeRatio(
        knownSum(["LA", "AA"], valueFor),
        knownSum(["ALA", "EPA", "DHA"], valueFor),
      );
    case "CAB":
    case "pH":
      return valueFor(code);
    default:
      return null;
  }
}

function rationAtomicValue(
  lines: RationLine[],
  foodRecords: Record<string, FoodRecord | undefined>,
  code: string,
): number | null {
  const activeLines = lines.flatMap((line) => {
    const grams = Number(line.grams.replace(",", "."));
    return Number.isFinite(grams) && grams > 0 ? [{ line, grams }] : [];
  });
  if (!activeLines.length) return null;
  let total = 0;
  for (const { line, grams } of activeLines) {
    const food = foodRecords[line.food.uuid];
    if (!food) return null;
    const sourceValue = foodNutrientAsFedValue(food, code);
    if (sourceValue == null) return null;
    total += sourceValue * grams / 100;
  }
  return total;
}

function rationNutrientValue(
  lines: RationLine[],
  foodRecords: Record<string, FoodRecord | undefined>,
  nutrient: TableNutrient,
): number | null {
  const code = canonicalNutrientCode(nutrient.code);
  if (CONTROL_NUTRIENT_CODE_SET.has(code)) {
    return controlNutrientValue(
      code,
      (atomicCode) => rationAtomicValue(lines, foodRecords, atomicCode),
    );
  }
  if (nutrient.derived) return null;
  return rationAtomicValue(lines, foodRecords, code);
}

function targetValueText(target: AssessmentRecord["rows"][number]["target"]): string {
  if (!target) return "—";
  if (target.minimum == null && target.maximum == null) return target.source_value_text || "—";
  if (target.minimum != null && target.maximum != null) return formatNumber(target.minimum) + "–" + formatNumber(target.maximum);
  if (target.minimum != null) return "≥ " + formatNumber(target.minimum);
  return "≤ " + formatNumber(target.maximum);
}

function targetText(target: AssessmentRecord["rows"][number]["target"]): string {
  if (!target) return "Не установлена";
  const suffix = target.basis === "daily_per_metabolic_bw" || target.basis === "per_day" ? "/сут" : "";
  if (target.minimum == null && target.maximum == null) return target.source_value_text || "Не установлена";
  if (target.minimum != null && target.maximum != null) return `${formatNumber(target.minimum)}–${formatNumber(target.maximum)} ${target.unit}${suffix}`;
  if (target.minimum != null) return `≥ ${formatNumber(target.minimum)} ${target.unit}${suffix}`;
  return `≤ ${formatNumber(target.maximum)} ${target.unit}${suffix}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function UnitInput({ unit, className, ...props }: React.ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className={cn("relative", className)}>
      <Input className="h-9 pr-11 shadow-none" {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">{unit}</span>
    </div>
  );
}

function CheckField({ label, checked, onChecked }: { label: string; checked: boolean; onChecked: (value: boolean) => void }) {
  const id = React.useId();
  return <div className="flex items-center gap-2"><Checkbox id={id} checked={checked} onCheckedChange={(value) => onChecked(value === true)} /><Label htmlFor={id} className="font-normal">{label}</Label></div>;
}
