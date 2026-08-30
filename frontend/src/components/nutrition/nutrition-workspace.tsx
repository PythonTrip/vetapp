"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronDown, FolderOpen, Loader2, Plus, RefreshCw, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FoodCatalog } from "@/components/nutrition/food-catalog";
import { PatientPicker } from "@/components/nutrition/patient-picker";
import { RationAddDialog } from "@/components/nutrition/ration-add-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  type AssessmentRequestPayload,
  type AssessmentSuggestionOption,
  type AssessmentStatus,
  type DietPlanRecord,
  type DietPlanSummaryRecord,
  type FeedForm,
  type FoodSummaryRecord,
  type GuidelineContextOptionsRecord,
  type PatientRecord,
  type WeightBasis,
  type WorkingEnergyTargetSource,
} from "@/lib/api-client";
import {
  useActiveGuidelineQuery,
  useCreateAssessment,
  useCreateDietPlan,
  useDietPlanQuery,
  useDietPlansQuery,
  useEnergyEstimate,
  useFoodEnergyValues,
  useGuidelineContextOptions,
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

const STATUS: Record<AssessmentStatus, { label: string; className: string }> = {
  met: { label: "Достигнуто", className: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" },
  below_minimum: { label: "Ниже минимума", className: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300" },
  above_maximum: { label: "Выше максимума", className: "border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/30 dark:text-orange-300" },
  not_established: { label: "Не установлено", className: "border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300" },
  not_applicable: { label: "Не применимо", className: "border-slate-300 bg-transparent text-muted-foreground" },
  insufficient_context: { label: "Недостаточно контекста", className: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300" },
  missing_product_data: { label: "Нет данных продукта", className: "border-violet-300 bg-violet-50 text-violet-900 dark:bg-violet-950/30 dark:text-violet-300" },
};

const FEED_LABEL: Record<FeedForm, string> = { dry: "сухая", wet: "влажная", unknown: "смешанная / неизвестная" };

function formatNumber(value: number | null, digits = 2): string {
  return value == null ? "—" : value.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

function inputClass() {
  return "h-9";
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

const CURRENT_NUTRITION_ENGINE_ID = "nutrition-engine/1.1.0";

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
  const [draftFormula, setDraftFormula] = React.useState("");
  const [confirmedProfile, setConfirmedProfile] = React.useState("");
  const [confirmedFormula, setConfirmedFormula] = React.useState("");
  const [sizeClassOverride, setSizeClassOverride] = React.useState("");
  const [weightBasis, setWeightBasis] = React.useState<WeightBasis>("current");
  const [rerFactor, setRerFactor] = React.useState("1.6");
  const [workingEnergyTarget, setWorkingEnergyTarget] = React.useState("");
  const [workingEnergyTargetSource, setWorkingEnergyTargetSource] = React.useState<WorkingEnergyTargetSource | null>(null);
  const [baseFormula, setBaseFormula] = React.useState("");
  const [baseMerPoint, setBaseMerPoint] = React.useState("");
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
  const contextOptions = useGuidelineContextOptions(
    animal.species === "dog" || animal.species === "cat" ? animal.species : null,
  );
  const previewFormula = draftFormula || confirmedFormula;
  const previewFormulaOption = contextOptions.data?.energy_formula_options.find(
    (item) => item.code === previewFormula,
  );
  const showExpectedMatureWeight = animal.species === "dog" && (
    animal.lifeStage === "puppy_kitten"
    || previewFormulaOption?.required_animal_fields.some(
      (field) => field === "expected_adult_weight_kg" || field === "expected_mature_weight_kg",
    ) === true
  );
  const previewConfirmed = Boolean(previewFormula) && previewFormula === confirmedFormula;
  const energyEstimate = useEnergyEstimate(assessmentAnimal && previewFormula ? {
    animal: assessmentAnimal,
    energy_formula_code: previewFormula,
    confirmed: previewConfirmed,
    weight_basis: weightBasis,
    size_class_override_code: sizeClassOverride || null,
    working_energy_target_kcal_day: null,
    working_energy_target_source: null,
  } : null);
  const baseEnergyEstimate = useEnergyEstimate(assessmentAnimal && baseFormula ? {
    animal: { ...assessmentAnimal, maintenance_energy_kcal_day: null },
    energy_formula_code: baseFormula,
    confirmed: false,
    weight_basis: "current",
    size_class_override_code: null,
    working_energy_target_kcal_day: null,
    working_energy_target_source: null,
  } : null);
  const foodEnergy = useFoodEnergyValues(lines.map((line) => line.food.uuid));
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
    setDraftFormula(request.confirmed_energy_formula_code ?? "");
    setConfirmedProfile(request.confirmed_profile_code ?? "");
    setConfirmedFormula(request.confirmed_energy_formula_code ?? "");
    setSizeClassOverride(
      request.size_class_override_code ?? request.confirmed_size_class_code ?? "",
    );
    setWeightBasis(request.weight_basis ?? "current");
    setRerFactor(String(request.rer_factor));
    setWorkingEnergyTarget(request.working_energy_target_kcal_day == null ? "" : String(request.working_energy_target_kcal_day));
    setWorkingEnergyTargetSource(request.working_energy_target_source ?? null);
    setBaseFormula("");
    setBaseMerPoint("");
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
        setDraftFormula("");
        setConfirmedProfile("");
        setConfirmedFormula("");
        setSizeClassOverride("");
        setWeightBasis("current");
        setWorkingEnergyTarget("");
        setWorkingEnergyTargetSource(null);
        setBaseFormula("");
        setBaseMerPoint("");
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
    setDraftFormula("");
    setConfirmedProfile("");
    setConfirmedFormula("");
    setSizeClassOverride("");
    setWeightBasis("current");
    setWorkingEnergyTarget("");
    setWorkingEnergyTargetSource(null);
    setBaseFormula("");
    setBaseMerPoint("");
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
    setDraftFormula("");
    setConfirmedProfile("");
    setConfirmedFormula("");
    setSizeClassOverride("");
    setWeightBasis("current");
    setWorkingEnergyTarget("");
    setWorkingEnergyTargetSource(null);
    setBaseFormula("");
    setBaseMerPoint("");
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
    if (patch.species && patch.species !== animal.species) {
      setConfirmedProfile("");
      setDraftFormula("");
      setConfirmedFormula("");
      setSizeClassOverride("");
      setWeightBasis("current");
      setWorkingEnergyTarget("");
      setWorkingEnergyTargetSource(null);
      setBaseFormula("");
      setBaseMerPoint("");
    }
    setAnimal((current) => ({ ...current, ...patch }));
    const keys = Object.keys(patch) as (keyof NutritionAnimalForm)[];
    const invalidates = keys.some((key) => {
      if (key === "bcs") return false;
      if (key === "targetBodyWeightKg") return weightBasis === "target_override";
      return true;
    });
    if (invalidates) invalidateAssessment();
  }

  React.useEffect(() => {
    const result = energyEstimate.data;
    if (
      !result?.confirmed
      || result.method_code !== confirmedFormula
      || result.value?.kind !== "point"
      || workingEnergyTargetSource !== "calculated_point"
    ) return;
    const next = String(Math.round(result.value.kcal_day * 100) / 100);
    setWorkingEnergyTarget((current) => current === next ? current : next);
  }, [confirmedFormula, energyEstimate.data, workingEnergyTargetSource]);

  function changeDraft(setter: (value: string) => void, value: string) {
    setter(value);
    invalidateAssessment();
  }

  function handleProfile(value: string) {
    setConfirmedProfile(value);
    setFormError(null);
    invalidateAssessment();
  }

  function handleFormula(value: string) {
    setDraftFormula(value);
    const option = contextOptions.data?.energy_formula_options.find((item) => item.code === value);
    if (!option?.allowed_weight_bases.includes("target_override") && weightBasis !== "current") {
      setWeightBasis("current");
      invalidateAssessment();
    }
    setBaseFormula("");
    setBaseMerPoint("");
  }

  function confirmContext() {
    if (!draftFormula) {
      setFormError("Выберите энергетический сценарий");
      return;
    }
    const estimate = energyEstimate.data;
    if (estimate?.method_code !== draftFormula || !estimate.value) {
      setFormError(estimate?.warnings.includes("missing_base_mer")
        ? "Сначала примените базовый взрослый метод MER и выберите точку."
        : "Дождитесь полного серверного расчёта энергетического сценария.");
      return;
    }
    setConfirmedFormula(draftFormula);
    if (estimate.value.kind === "point") {
      setWorkingEnergyTarget(String(Math.round(estimate.value.kcal_day * 100) / 100));
      setWorkingEnergyTargetSource("calculated_point");
    } else {
      setWorkingEnergyTarget("");
      setWorkingEnergyTargetSource(null);
    }
    setFormError(null);
    invalidateAssessment();
  }

  function changeWorkingEnergyTarget(value: string) {
    setWorkingEnergyTarget(value);
    if (!value.trim()) {
      setWorkingEnergyTargetSource(null);
    } else {
      setWorkingEnergyTargetSource(
        energyEstimate.data?.value?.kind === "range"
          ? "clinician_selected_from_range"
          : "clinician_override",
      );
    }
    invalidateAssessment();
  }

  function applyBaseMer() {
    const value = baseEnergyEstimate.data?.value;
    if (!value) {
      setFormError("Дождитесь расчёта базовой MER.");
      return;
    }
    const selected = value.kind === "point"
      ? value.kcal_day
      : Number(baseMerPoint.replace(",", "."));
    if (!Number.isFinite(selected) || selected <= 0) {
      setFormError("Выберите точку базовой MER.");
      return;
    }
    if (value.kind === "range" && (selected < value.min_kcal_day || selected > value.max_kcal_day)) {
      setFormError("Точка базовой MER должна находиться внутри показанного диапазона.");
      return;
    }
    patchAnimal({ maintenanceEnergyKcalDay: String(Math.round(selected * 100) / 100) });
    setFormError(null);
  }

  function startCurrentVersionRecalculation() {
    setDraftFormula("");
    setConfirmedProfile("");
    setConfirmedFormula("");
    setSizeClassOverride("");
    setWeightBasis("current");
    setWorkingEnergyTarget("");
    setWorkingEnergyTargetSource(null);
    setBaseFormula("");
    setBaseMerPoint("");
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
    if (animal.species !== "other" && (!confirmedProfile || !confirmedFormula)) {
      throw new Error("Подтвердите нутриентный стандарт и энергетический сценарий");
    }
    const factor = Number(rerFactor.replace(",", "."));
    if (!Number.isFinite(factor) || factor <= 0) throw new Error("Проверьте коэффициент RER");
    const targetText = workingEnergyTarget.trim().replace(",", ".");
    const target = targetText ? Number(targetText) : null;
    if (target != null && (!Number.isFinite(target) || target <= 0)) {
      throw new Error("Проверьте рабочую энергетическую цель");
    }
    if ((target == null) !== (workingEnergyTargetSource == null)) {
      throw new Error("Укажите рабочую энергетическую цель и её источник");
    }
    if (historicalRecalculationStarted && animal.species !== "other" && target == null) {
      throw new Error("Для пересчёта по текущей версии выберите рабочую энергетическую цель");
    }
    return {
      animal: toAssessmentAnimal(animal),
      confirmed_profile_code: animal.species === "other" ? null : confirmedProfile,
      confirmed_energy_formula_code: animal.species === "other" ? null : confirmedFormula,
      weight_basis: animal.species === "other" ? "current" : weightBasis,
      size_class_override_code: animal.species === "other" ? null : (sizeClassOverride || null),
      feed_form: effectiveFeedForm,
      therapeutic_goal: false,
      rer_factor: factor,
      working_energy_target_kcal_day: target,
      working_energy_target_source: workingEnergyTargetSource,
      ration_species_mismatch_confirmed: false,
      components,
    };
  }

  async function runAssessment() {
    setFormError(null);
    if (plan.data?.assessment_snapshot.assessment || assessment.data) {
      setAssessmentDirty(true);
    }
    try {
      const accepted = await assessment.mutateAsync(buildAssessmentRequest());
      if (accepted) setAssessmentDirty(false);
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
    }
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
        description: `${saved.name} · ${saved.uuid}`,
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
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Клиническая диетология</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{plan.data?.name ?? "Рацион и оценка FEDIAF 2025"}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {plan.data ? `Сохранённый план · ${plan.data.uuid}` : "Сервер рассчитывает энергию и нутриенты по опубликованной редакции PostgreSQL."}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setSaveOpen(true)}
          disabled={planId
            ? historicalSnapshotLocked || !assessment.data || assessmentDirty
            : !assessment.data}
        >
          {planId ? <RefreshCw className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {planId ? "Пересчитать и сохранить" : "Сохранить план"}
        </Button>
      </div>

      <Tabs defaultValue="assessment" className="space-y-5">
        <TabsList>
          <TabsTrigger value="assessment">Рацион и анализ</TabsTrigger>
          <TabsTrigger value="plans">Недавние планы</TabsTrigger>
          <TabsTrigger value="catalog">Каталог Foods</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog"><FoodCatalog /></TabsContent>
        <TabsContent value="plans"><RecentPlans plans={recentPlans.data ?? []} pending={recentPlans.isPending} error={recentPlans.isError ? apiErrorMessage(recentPlans.error) : null} /></TabsContent>
        <TabsContent value="assessment" className="space-y-5">
          {plan.data ? (
            <SnapshotNotice
              plan={plan.data}
              historical={historicalPlan}
              recalculationStarted={historicalRecalculationStarted}
              onStartCurrentRecalculation={startCurrentVersionRecalculation}
            />
          ) : <GuidelineWarning guideline={guideline} />}

          <fieldset disabled={historicalSnapshotLocked} className="space-y-5">
            <AnimalContextPanel
              animal={animal}
              disabled={historicalSnapshotLocked || (Boolean(patientId) && patient.isPending)}
              onPatch={patchAnimal}
              showExpectedMatureWeight={showExpectedMatureWeight}
              selectedPatientId={selectedPatientId}
              selectedPatient={selectedPatient.data ?? null}
              selectedPatientPending={Boolean(selectedPatientId) && selectedPatient.isPending}
              onPatientChange={handlePatientChange}
              planId={planId}
              patientError={patientId && patient.isError ? apiErrorMessage(patient.error) : null}
              standardOptions={contextOptions.data?.profile_options ?? []}
              standardPending={contextOptions.isPending}
              standardError={contextOptions.isError ? apiErrorMessage(contextOptions.error) : null}
              confirmedProfile={confirmedProfile}
              onProfile={handleProfile}
            />

            <EnergyStrip
              data={contextOptions.data}
              draftFormula={draftFormula}
              sizeClassOverride={sizeClassOverride}
              weightBasis={weightBasis}
              confirmedFormula={confirmedFormula}
              onFormula={handleFormula}
              onSizeClassOverride={(value) => changeDraft(setSizeClassOverride, value === "none" ? "" : value)}
              onWeightBasis={(value) => {
                setWeightBasis(value);
                invalidateAssessment();
              }}
              onConfirm={confirmContext}
              estimate={energyEstimate}
              workingEnergyTarget={workingEnergyTarget}
              onWorkingEnergyTarget={changeWorkingEnergyTarget}
              baseFormula={baseFormula}
              onBaseFormula={(value) => {
                setBaseFormula(value);
                setBaseMerPoint("");
                patchAnimal({ maintenanceEnergyKcalDay: "" });
              }}
              baseEstimate={baseEnergyEstimate}
              baseMerPoint={baseMerPoint}
              onBaseMerPoint={setBaseMerPoint}
              onApplyBaseMer={applyBaseMer}
              rerFactor={rerFactor}
              onRerFactor={setRerFactor}
              currentBodyWeightKg={animal.currentBodyWeightKg}
            />

            <RationCard
              lines={lines}
              onOpenAdd={() => setRationAddOpen(true)}
              onGrams={setLineGrams}
              onRemove={(id) => { setLines((current) => current.filter((line) => line.food.uuid !== id)); invalidateAssessment(); }}
              inferredFeedForm={inferredFeedForm}
              feedOverride={feedOverride}
              onFeedOverride={(value) => { setFeedOverride(value); invalidateAssessment(); }}
              assessmentPending={assessment.isPending}
              onAssess={runAssessment}
              workingEnergyTarget={workingEnergyTarget}
              energyValues={foodEnergy.data}
              energyValuesPending={foodEnergy.isPending}
            />
          </fieldset>

          {formError ? <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{formError}</p> : null}
          {!planId && assessment.isPending && !displayedAssessment ? <AssessmentSkeleton /> : displayedAssessment ? <AssessmentPanel assessment={displayedAssessment} dirty={assessmentDirty} rationKcal={rationKcal} /> : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {animal.species !== "other" && !confirmedProfile
                  ? "Выерите и подтвердите нутриентный стандарт и энергетический сценарий, затем запустите оценку."
                  : "Заполните рацион и запустите серверную оценку."}
              </CardContent>
            </Card>
          )}
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
    <div className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950 dark:bg-sky-950/25 dark:text-sky-200">
      <div className="mb-1 flex items-center gap-2 font-semibold"><Save className="h-4 w-4" /> Сохранённый snapshot · FEDIAF {plan.edition_code} · {plan.engine_id}</div>
      <p>Цифры, контекст и предупреждение ниже загружены из сохранённого snapshot. При открытии пересчёт не выполнялся.</p>
      {historical ? <p className="mt-2 font-semibold">Расчёт выполнен предыдущей версией nutrition engine.</p> : null}
      <p className="mt-2 rounded-lg border border-sky-300/70 bg-white/50 p-3 text-xs dark:bg-sky-950/30"><strong>Клиническое предупреждение:</strong> {plan.assessment_snapshot.assessment.edition.clinical_warning_ru}</p>
      {historical && !recalculationStarted ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={onStartCurrentRecalculation}>
            <RefreshCw className="h-4 w-4" />
            Пересчитать по текущей версии
          </Button>
          <p className="text-xs">Животное и рацион будут взяты как стартовые данные; стандарт, энергетический сценарий и рабочая цель нужно подтвердить заново.</p>
        </div>
      ) : (
        <p className="mt-2 text-xs">
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
        {plans.map((item) => <Link key={item.uuid} href={`/nutrition?planId=${item.uuid}`} className="flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"><span><strong>{item.name}</strong><span className="ml-2 text-xs text-muted-foreground">{item.patient?.name ?? "без Patient"}</span></span><span className="text-xs text-muted-foreground">FEDIAF {item.edition_code} · {item.engine_id}</span></Link>)}
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
  if (guideline.isPending) return <Skeleton className="h-20 w-full" />;
  if (guideline.isError) return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
      Обязательное клиническое предупреждение недоступно: {apiErrorMessage(guideline.error)}
    </div>
  );
  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-200">
      <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Клиническое предупреждение · FEDIAF {guideline.data?.code}</div>
      <p>{guideline.data?.clinical_warning_ru}</p>
    </div>
  );
}

function AnimalContextPanel({ animal, disabled, onPatch, showExpectedMatureWeight, selectedPatientId, selectedPatient, selectedPatientPending, onPatientChange, planId, patientError, standardOptions, standardPending, standardError, confirmedProfile, onProfile }: {
  animal: NutritionAnimalForm;
  disabled: boolean;
  onPatch: (patch: Partial<NutritionAnimalForm>) => void;
  showExpectedMatureWeight: boolean;
  selectedPatientId: string;
  selectedPatient: PatientRecord | null;
  selectedPatientPending: boolean;
  onPatientChange: (value: string) => void;
  planId: string;
  patientError: string | null;
  standardOptions: AssessmentSuggestionOption[];
  standardPending: boolean;
  standardError: string | null;
  confirmedProfile: string;
  onProfile: (value: string) => void;
}) {
  const showPregnancy = animal.lifeStage === "gestation" || animal.pregnant;
  const showLactation = animal.lifeStage === "lactation" || animal.lactating;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Клинический контекст</CardTitle>
        <CardDescription>Пациент и параметры этой сессии. Изменения не записываются обратно в карточку Patient.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Пациент">
            <PatientPicker
              id="nutrition-patient-picker"
              value={selectedPatientId}
              selected={selectedPatient}
              selectedPending={selectedPatientPending}
              onChange={onPatientChange}
            />
            <p className="text-[11px] text-muted-foreground">
              {planId
                ? "Открыт snapshot: смена пациента не перезапишет его до сохранения."
                : selectedPatientId
                  ? "Параметры предзаполнены из карточки и остаются сессионными."
                  : "Без пациента · ручной профиль."}
            </p>
          </Field>
          <Field label="Нутриентный стандарт">
            {standardPending ? <Skeleton className="h-9 w-full" /> : (
              <Select
                value={confirmedProfile || undefined}
                onValueChange={onProfile}
                disabled={animal.species === "other" || !standardOptions.length}
              >
                <SelectTrigger><SelectValue placeholder={animal.species === "other" ? "Только для собак и кошек" : "Выберите стандарт"} /></SelectTrigger>
                <SelectContent>{standardOptions.map((item) => <SelectItem key={item.code} value={item.code}>{item.name_ru}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground">Выбор применяется сразу, без дополнительной кнопки.</p>
          </Field>
        </div>
        {patientError ? <p className="text-sm text-destructive" role="alert">{patientError}</p> : null}
        {standardError ? <p className="text-sm text-destructive" role="alert">{standardError}</p> : null}
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Вид"><Select value={animal.species} onValueChange={(species) => onPatch({ species: species as NutritionAnimalForm["species"] })} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SPECIES_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Текущая масса, кг"><Input className={inputClass()} inputMode="decimal" value={animal.currentBodyWeightKg} onChange={(event) => onPatch({ currentBodyWeightKg: event.target.value })} disabled={disabled} /></Field>
          <Field label="Целевая масса, кг"><Input className={inputClass()} inputMode="decimal" value={animal.targetBodyWeightKg} onChange={(event) => onPatch({ targetBodyWeightKg: event.target.value })} disabled={disabled} /><p className="text-[11px] text-muted-foreground">Необязательная клиническая цель.</p></Field>
          {showExpectedMatureWeight ? <Field label="Ожидаемый взрослый вес, кг"><Input className={inputClass()} inputMode="decimal" value={animal.expectedMatureWeightKg} onChange={(event) => onPatch({ expectedMatureWeightKg: event.target.value })} disabled={disabled} /></Field> : null}
          <Field label="Возраст, месяцев"><Input className={inputClass()} inputMode="decimal" value={animal.ageMonths} onChange={(event) => onPatch({ ageMonths: event.target.value })} disabled={disabled} /></Field>
          <Field label="Стадия жизни"><Select value={animal.lifeStage || "none"} onValueChange={(value) => onPatch({ lifeStage: value === "none" ? "" : value })} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Не указана</SelectItem>{LIFE_STAGE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Активность"><Select value={animal.activity || "none"} onValueChange={(value) => onPatch({ activity: value === "none" ? "" : value })} disabled={disabled}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Не указана</SelectItem>{ACTIVITY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="BCS, 1–9"><Input className={inputClass()} inputMode="numeric" value={animal.bcs} onChange={(event) => onPatch({ bcs: event.target.value })} disabled={disabled} /></Field>
          <div className="flex flex-wrap items-center gap-4 pt-6 sm:col-span-2 lg:col-span-1">
            <CheckField label="Стерилизовано" checked={animal.neutered} onChecked={(value) => onPatch({ neutered: value })} />
            {showPregnancy ? <CheckField label="Беременность" checked={animal.pregnant} onChecked={(value) => onPatch({ pregnant: value })} /> : null}
            {showLactation ? <CheckField label="Лактация" checked={animal.lactating} onChecked={(value) => onPatch({ lactating: value })} /> : null}
          </div>
          {animal.lactating ? <Field label="Неделя лактации"><Input className={inputClass()} inputMode="numeric" value={animal.lactationWeek} onChange={(event) => onPatch({ lactationWeek: event.target.value })} disabled={disabled} /></Field> : null}
          {animal.lactating ? <Field label="Размер помёта"><Input className={inputClass()} inputMode="numeric" value={animal.litterSize} onChange={(event) => onPatch({ litterSize: event.target.value })} disabled={disabled} /></Field> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EnergyStrip({ data, draftFormula, sizeClassOverride, weightBasis, confirmedFormula, onFormula, onSizeClassOverride, onWeightBasis, onConfirm, estimate, workingEnergyTarget, onWorkingEnergyTarget, baseFormula, onBaseFormula, baseEstimate, baseMerPoint, onBaseMerPoint, onApplyBaseMer, rerFactor, onRerFactor, currentBodyWeightKg }: {
  data: GuidelineContextOptionsRecord | undefined;
  draftFormula: string;
  sizeClassOverride: string;
  weightBasis: WeightBasis;
  confirmedFormula: string;
  onFormula: (value: string) => void;
  onSizeClassOverride: (value: string) => void;
  onWeightBasis: (value: WeightBasis) => void;
  onConfirm: () => void;
  estimate: ReturnType<typeof useEnergyEstimate>;
  workingEnergyTarget: string;
  onWorkingEnergyTarget: (value: string) => void;
  baseFormula: string;
  onBaseFormula: (value: string) => void;
  baseEstimate: ReturnType<typeof useEnergyEstimate>;
  baseMerPoint: string;
  onBaseMerPoint: (value: string) => void;
  onApplyBaseMer: () => void;
  rerFactor: string;
  onRerFactor: (value: string) => void;
  currentBodyWeightKg: string;
}) {
  const formulas = data?.energy_formula_options ?? [];
  const formulaValue = formulas.some((item) => item.code === draftFormula) ? draftFormula : undefined;
  const selectedFormula = formulas.find((item) => item.code === draftFormula);
  const requiresBaseMer = selectedFormula?.required_animal_fields.includes("maintenance_energy_kcal_day") ?? false;
  const supportsTargetWeight = selectedFormula?.allowed_weight_bases.includes("target_override") ?? false;
  const adultCatFormulas = formulas.filter((item) => ["adult_indoor_neutered", "adult_active"].includes(item.code));
  const estimateValue = estimate.data?.value;
  const baseValue = baseEstimate.data?.value;
  const derivedSizeCode = estimate.data?.size_class_derived_code;
  const derivedSize = data?.size_class_options.find((item) => item.code === derivedSizeCode);
  const derivedSizeLabel = estimate.isPending
    ? "рассчитывается…"
    : derivedSize?.name_ru ?? "нужен ожидаемый взрослый вес";
  const currentWeight = Number(currentBodyWeightKg.replace(",", "."));
  const factor = Number(rerFactor.replace(",", "."));
  const rer = Number.isFinite(currentWeight) && currentWeight > 0 ? 70 * currentWeight ** 0.75 : null;
  const rerAdjusted = rer != null && Number.isFinite(factor) && factor > 0 ? rer * factor : null;
  const methodName = selectedFormula?.name_ru ?? (confirmedFormula || "Метод не выбран");
  const inputSummary = estimate.data
    ? Object.entries(estimate.data.inputs).map(([key, value]) => {
      const label = key.includes("expected") ? "взрослый вес" : key.includes("target") ? "целевая масса" : "текущая масса";
      return `${label} ${formatNumber(value)} кг`;
    }).join(" · ")
    : "Укажите массу и метод";
  return (
    <Collapsible asChild>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.35fr)_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">Энергия</h2>
                {estimate.data ? <Badge variant="outline">{estimate.data.confirmed ? "Применено" : "Предпросмотр"}</Badge> : null}
              </div>
              {estimate.isPending ? <Skeleton className="mt-2 h-8 w-56" /> : estimateValue ? (
                <p className="mt-1 text-2xl font-bold tracking-tight">{estimateValue.kind === "point" ? `${formatNumber(estimateValue.kcal_day, 0)} ккал/сут` : `${formatNumber(estimateValue.min_kcal_day, 0)}–${formatNumber(estimateValue.max_kcal_day, 0)} ккал/сут`}</p>
              ) : <p className="mt-1 text-lg font-semibold text-muted-foreground">Расчёт ещё не готов</p>}
              <p className="mt-1 text-sm">{methodName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{inputSummary}</p>
              {estimate.error ? <p className="mt-2 text-sm text-destructive">{apiErrorMessage(estimate.error)}</p> : null}
            </div>
            <div>
              <Field label="Рабочая цель, ккал/сут">
                <Input
                  inputMode="decimal"
                  value={workingEnergyTarget}
                  onChange={(event) => onWorkingEnergyTarget(event.target.value)}
                  placeholder={estimateValue?.kind === "range" ? "Выберите точку" : "После применения метода"}
                  disabled={!confirmedFormula}
                />
                {!workingEnergyTarget.trim() ? <p className="text-[11px] text-muted-foreground">Рабочая цель ещё не выбрана</p> : null}
              </Field>
            </div>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="justify-between lg:min-w-44">
                <SlidersHorizontal className="size-4" />
                Изменить метод
                <ChevronDown className="size-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-5 space-y-4 border-t pt-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <Field label="Энергетический сценарий"><Select value={formulaValue} onValueChange={onFormula} disabled={!formulas.length}><SelectTrigger><SelectValue placeholder="Выберите метод" /></SelectTrigger><SelectContent>{formulas.map((item) => <SelectItem key={item.code} value={item.code}>{item.name_ru}</SelectItem>)}</SelectContent></Select></Field>
              <Button type="button" onClick={onConfirm} disabled={!draftFormula || estimate.isPending || !estimateValue}>Применить метод</Button>
            </div>
            {data?.size_class_options.length || supportsTargetWeight ? (
              <div className="grid gap-3 md:grid-cols-2">
                  {data?.size_class_options.length ? (
                    <div className="space-y-2">
                      <p className="text-sm">Расчётный размерный класс: <strong>{derivedSizeLabel}</strong></p>
                      <Field label="Переопределение размерного класса"><Select value={sizeClassOverride || "none"} onValueChange={onSizeClassOverride}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Без переопределения</SelectItem>{data.size_class_options.map((item) => <SelectItem key={item.code} value={item.code}>{item.name_ru}</SelectItem>)}</SelectContent></Select></Field>
                    </div>
                  ) : null}
                  {supportsTargetWeight ? <Field label="Основа массы для формулы"><Select value={weightBasis} onValueChange={(value) => onWeightBasis(value as WeightBasis)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="current">Текущая масса</SelectItem><SelectItem value="target_override">Целевая масса (явный выбор)</SelectItem></SelectContent></Select></Field> : null}
              </div>
            ) : null}
            {requiresBaseMer ? (
              <div className="space-y-3 rounded-xl border border-sky-300/70 bg-sky-50/60 p-4 dark:bg-sky-950/20">
                <div><p className="text-sm font-semibold">Базовая MER взрослой кошки</p><p className="text-xs text-muted-foreground">Сначала примените взрослый метод. Если он даёт диапазон, выберите точку явно.</p></div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
                  <Field label="Базовый метод"><Select value={baseFormula || undefined} onValueChange={onBaseFormula}><SelectTrigger><SelectValue placeholder="Выберите метод" /></SelectTrigger><SelectContent>{adultCatFormulas.map((item) => <SelectItem key={item.code} value={item.code}>{item.name_ru}</SelectItem>)}</SelectContent></Select></Field>
                  {baseValue?.kind === "range" ? <Field label="Точка MER"><Input inputMode="decimal" value={baseMerPoint} onChange={(event) => onBaseMerPoint(event.target.value)} placeholder={`${formatNumber(baseValue.min_kcal_day, 0)}–${formatNumber(baseValue.max_kcal_day, 0)}`} /></Field> : <div className="pb-2 text-sm font-semibold">{baseValue?.kind === "point" ? `${formatNumber(baseValue.kcal_day, 0)} ккал/сут` : baseEstimate.isPending ? "Расчёт…" : "—"}</div>}
                  <Button type="button" variant="outline" onClick={onApplyBaseMer} disabled={!baseFormula || baseEstimate.isPending || !baseValue || (baseValue.kind === "range" && !baseMerPoint.trim())}>Применить базовую MER</Button>
                </div>
              </div>
            ) : null}
            <div className="rounded-xl bg-muted/40 p-4 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Источник и метод:</strong> FEDIAF {estimate.data?.source.edition ?? data?.edition_code ?? "—"} · {estimate.data?.source.table ?? "таблица не указана"} · стр. {estimate.data?.source.page ?? "—"}</p>
              {estimate.data?.base_mer_value ? <p className="mt-1">Базовая MER: {formatNumber(estimate.data.base_mer_value.kcal_day, 0)} ккал/сут</p> : null}
              {estimate.data?.multiplier_value ? <p className="mt-1">Множитель: {estimate.data.multiplier_value.kind === "point" ? formatNumber(estimate.data.multiplier_value.factor) : `${formatNumber(estimate.data.multiplier_value.min_factor)}–${formatNumber(estimate.data.multiplier_value.max_factor)}`} × базовая MER</p> : null}
              {estimate.data?.warnings.includes("missing_base_mer") ? <p className="mt-2 text-amber-700 dark:text-amber-300">Не выбрана базовая MER; нижняя граница не подставляется автоматически.</p> : null}
              {draftFormula && !estimateValue && estimate.data?.missing_fields.length ? <p className="mt-2 text-amber-700 dark:text-amber-300">Нужны поля: {estimate.data.missing_fields.join(", ")}.</p> : null}
            </div>
          </CollapsibleContent>
          <div className="mt-5 border-t pt-4">
            <p className="text-sm font-semibold">Дополнительная сверка</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_150px] sm:items-end">
              <div><p className="text-xs text-muted-foreground">RER · 70 × масса^0,75</p><p className="mt-1 font-semibold">{rer == null ? "Нет массы" : `${formatNumber(rer, 0)} ккал/сут`}</p></div>
              <div><p className="text-xs text-muted-foreground">RER × коэффициент</p><p className="mt-1 font-semibold">{rerAdjusted == null ? "Неполный расчёт" : `${formatNumber(rerAdjusted, 0)} ккал/сут`}</p></div>
              <Field label="Коэффициент"><Input inputMode="decimal" value={rerFactor} onChange={(event) => onRerFactor(event.target.value)} /></Field>
            </div>
          </div>
        </CardContent>
      </Card>
    </Collapsible>
  );
}

function RationCard({ lines, onOpenAdd, onGrams, onRemove, inferredFeedForm, feedOverride, onFeedOverride, assessmentPending, onAssess, workingEnergyTarget, energyValues, energyValuesPending }: {
  lines: RationLine[]; onOpenAdd: () => void; onGrams: (id: string, value: string) => void; onRemove: (id: string) => void; inferredFeedForm: FeedForm; feedOverride: "auto" | "dry" | "wet"; onFeedOverride: (value: "auto" | "dry" | "wet") => void; assessmentPending: boolean; onAssess: () => void; workingEnergyTarget: string; energyValues: Record<string, number | null>; energyValuesPending: boolean;
}) {
  const lineKcal = lines.map((line) => {
    const grams = Number(line.grams.replace(",", "."));
    const density = energyValues[line.food.uuid];
    return density != null && Number.isFinite(grams) && grams > 0 ? density * grams / 100 : null;
  });
  const rationComplete = lines.length > 0 && lineKcal.every((value) => value != null);
  const rationKcal = rationComplete ? lineKcal.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const target = Number(workingEnergyTarget.replace(",", "."));
  const hasTarget = workingEnergyTarget.trim().length > 0 && Number.isFinite(target) && target > 0;
  return (
    <Card>
      <CardHeader className="sm:grid-cols-[1fr_auto] sm:items-start">
        <div><CardTitle className="text-base">Рацион</CardTitle><CardDescription className="mt-1">Основное рабочее поле: продукты, масса и рассчитанная энергия.</CardDescription></div>
        <Button type="button" onClick={onOpenAdd}><Plus className="size-4" />Добавить</Button>
      </CardHeader>
      <CardContent className="space-y-5 p-0">
        <div className="overflow-x-auto border-y">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-6 py-3 font-medium">Продукт</th><th className="w-36 px-3 py-3 font-medium">г</th><th className="w-36 px-3 py-3 text-right font-medium">ккал</th><th className="w-16 px-3 py-3"><span className="sr-only">Удалить</span></th></tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.food.uuid} className="border-t align-middle">
                  <td className="px-6 py-3"><p className="font-medium">{line.food.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{line.food.type} · {FEED_LABEL[line.food.feed_form]}</p></td>
                  <td className="px-3 py-2"><Input aria-label={`Граммы: ${line.food.name}`} inputMode="decimal" value={line.grams} onChange={(event) => onGrams(line.food.uuid, event.target.value)} /></td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{energyValuesPending && energyValues[line.food.uuid] === undefined ? "…" : lineKcal[index] == null ? "—" : formatNumber(lineKcal[index], 0)}</td>
                  <td className="px-3 py-2 text-right"><Button type="button" variant="ghost" size="icon" onClick={() => onRemove(line.food.uuid)} aria-label={`Удалить ${line.food.name}`}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
              {!lines.length ? <tr className="border-t"><td colSpan={4} className="px-6 py-10 text-center"><p className="font-medium">Рацион пока пуст</p><p className="mt-1 text-sm text-muted-foreground">Нажмите «Добавить», найдите продукт по названию или категории.</p></td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 px-6 sm:grid-cols-[minmax(0,1fr)_minmax(240px,0.55fr)]">
          <div className="rounded-xl bg-muted/40 p-4 text-sm">
            {hasTarget ? <div className="flex justify-between gap-3"><span>Рабочая цель</span><strong>{formatNumber(target, 0)} ккал/сут</strong></div> : null}
            <div className={hasTarget ? "mt-2 flex justify-between gap-3" : "flex justify-between gap-3"}><span>Рацион</span><strong>{rationKcal == null ? "Недостаточно данных ME" : `${formatNumber(rationKcal, 0)} ккал/сут`}</strong></div>
            {hasTarget && rationKcal != null ? <div className="mt-2 flex justify-between gap-3"><span>Разница</span><strong>{formatNumber(rationKcal - target, 0)} ккал/сут</strong></div> : null}
            {!hasTarget ? <p className="mt-2 text-muted-foreground">Рабочая цель ещё не выбрана</p> : null}
          </div>
          <Field label="Форма корма">
            <Select value={feedOverride} onValueChange={(value) => onFeedOverride(value as "auto" | "dry" | "wet")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Авто · {FEED_LABEL[inferredFeedForm]}</SelectItem><SelectItem value="dry">Сухая</SelectItem><SelectItem value="wet">Влажная</SelectItem></SelectContent></Select>
            <p className="text-[11px] text-muted-foreground">Для смешанного рациона Se/Tau требуют явного выбора.</p>
          </Field>
        </div>
        <div className="flex justify-end px-6 pb-6"><Button type="button" onClick={onAssess} disabled={!lines.length || assessmentPending}>{assessmentPending ? <Loader2 className="size-4 animate-spin" /> : null}Оценить рацион</Button></div>
      </CardContent>
    </Card>
  );
}

function AssessmentSkeleton() {
  return <div className="space-y-3" aria-busy="true"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
}

type AssessmentFilter = "deviations" | "all" | "missing" | "sources";

function AssessmentPanel({ assessment, dirty, rationKcal }: { assessment: AssessmentRecord; dirty: boolean; rationKcal: number | null }) {
  const [filter, setFilter] = React.useState<AssessmentFilter>("deviations");
  const overall = assessment.overall === "adequate"
    ? "Рацион соответствует применимым нормам"
    : assessment.overall === "inadequate"
      ? "Есть отклонения от применимых норм"
      : "Недостаточно данных для полного вывода";
  const overallClass = dirty ? "border-slate-300 bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100" : assessment.overall === "adequate"
    ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-200"
    : assessment.overall === "inadequate"
      ? "border-red-300 bg-red-50 text-red-950 dark:bg-red-950/20 dark:text-red-200"
      : "border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-200";
  const target = assessment.energy.working_energy_target_kcal_day
    ?? assessment.context.working_energy_target_kcal_day;
  const missingStatuses = new Set<AssessmentStatus>([
    "missing_product_data",
    "insufficient_context",
    "not_established",
  ]);
  const filteredRows = assessment.rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "missing") return missingStatuses.has(row.status);
    if (filter === "deviations") {
      return row.status === "below_minimum"
        || row.status === "above_maximum"
        || missingStatuses.has(row.status);
    }
    return false;
  });
  const sources = Array.from(new Map(assessment.rows.map((row) => {
    const key = `${row.source.title}|${row.source.table}|${row.source.page}|${row.source.url}`;
    return [key, row.source] as const;
  })).values());
  return (
    <div className="space-y-4">
      {dirty ? (
        <div className="rounded-xl border border-slate-400 bg-slate-100 p-4 text-slate-900 dark:bg-slate-900 dark:text-slate-100" role="status">
          <p className="font-semibold">Расчёт устарел</p>
          <p className="mt-1 text-sm">Входные данные изменены. Предыдущие статусы показаны только как история; запустите оценку снова.</p>
        </div>
      ) : null}
      {assessment.gate ? <div className="rounded-xl border border-amber-400 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-200"><h2 className="font-semibold">Нормативное сравнение остановлено</h2><p className="mt-1 text-sm">{assessment.gate.explanation_ru}</p><p className="mt-3 text-xs">{assessment.edition.clinical_warning_ru}</p></div> : null}
      {assessment.normative_comparison_performed ? (
        <Card aria-label={dirty ? "Устаревший результат оценки" : undefined}>
          <CardHeader>
            <CardTitle className="text-base">Результаты оценки</CardTitle>
            <CardDescription>Сначала итог и отклонения; полный перечень доступен по фильтру.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className={`rounded-xl border p-4 ${overallClass}`}>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <p className="text-sm font-semibold">Энергия: {rationKcal == null ? "рацион —" : formatNumber(rationKcal, 0)} / {target == null ? "цель не выбрана" : `${formatNumber(target, 0)} ккал`}</p>
                  <p className="mt-2 font-semibold">Итог: {overall}</p>
                  {assessment.unevaluable_count > 0 ? <p className="mt-2 text-sm">Не хватает данных по {assessment.unevaluable_count} из {assessment.coverage.expected_atomic_count} показателей.</p> : null}
                </div>
                {dirty ? <Badge variant="outline" className="border-slate-400">Устарело</Badge> : null}
              </div>
              <div className="mt-4 grid gap-x-5 gap-y-2 border-t border-current/15 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <span><strong>{assessment.met_count}</strong> соответствуют</span>
                <span><strong>{assessment.below_minimum_count}</strong> ниже минимума</span>
                <span><strong>{assessment.above_maximum_count}</strong> выше максимума</span>
                <span><strong>{assessment.unevaluable_count}</strong> невозможно оценить</span>
              </div>
            </div>

            <Tabs value={filter} onValueChange={(value) => setFilter(value as AssessmentFilter)}>
              <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/60 p-1">
                <TabsTrigger value="deviations" className="shrink-0">Отклонения</TabsTrigger>
                <TabsTrigger value="all" className="shrink-0">Все нутриенты</TabsTrigger>
                <TabsTrigger value="missing" className="shrink-0">Нет данных</TabsTrigger>
                <TabsTrigger value="sources" className="shrink-0">Источники</TabsTrigger>
              </TabsList>
            </Tabs>

            {filter === "sources" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Диагностика покрытия: {formatNumber(assessment.coverage.percent, 1)}% · {assessment.coverage.complete_atomic_count} из {assessment.coverage.expected_atomic_count} атомарных показателей.</p>
                <div className="divide-y rounded-xl border">
                  {sources.map((source, index) => <div key={`${source.title}-${index}`} className="p-4 text-sm"><p className="font-medium">{source.title}</p><p className="mt-1 text-xs text-muted-foreground">{source.table ?? "Таблица не указана"} · стр. {source.page ?? "—"}{source.row ? ` · ${source.row}` : ""}</p>{source.url ? <a className="mt-2 inline-block text-xs text-primary underline-offset-4 hover:underline" href={source.url} target="_blank" rel="noreferrer">Открыть источник</a> : null}</div>)}
                </div>
                <p className="text-xs text-muted-foreground">{assessment.engine_id} · редакция {assessment.edition.code}</p>
              </div>
            ) : filteredRows.length ? (
              <div className={dirty ? "overflow-x-auto opacity-60" : "overflow-x-auto"}>
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-y bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Нутриент</th><th className="px-3 py-3">Рацион</th><th className="px-3 py-3">Цель FEDIAF</th><th className="px-3 py-3">Статус</th></tr></thead>
                  <tbody>{filteredRows.map((row, index) => {
                    const status = STATUS[row.status];
                    return <tr key={`${row.code}-${index}`} className="border-b align-top"><td className="px-4 py-3"><div className="font-medium">{row.name}</div><div className="mt-1 flex gap-1 text-[11px] text-muted-foreground"><span>{row.code}</span>{row.derived ? <Badge variant="outline" className="text-[10px]">расчётное</Badge> : null}</div></td><td className="px-3 py-3 font-mono text-xs">{formatNumber(row.ration_daily_amount ?? row.ration_per_1000_kcal_me)} {row.unit}{row.ration_daily_amount != null ? "/сут" : ""}</td><td className="px-3 py-3 text-xs">{targetText(row.target)}</td><td className="px-3 py-3">{dirty ? <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">Устарело</Badge> : <Badge variant="outline" className={status.className}>{status.label}</Badge>}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">В этом фильтре строк нет.</div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function targetText(target: AssessmentRecord["rows"][number]["target"]): string {
  if (!target) return "Не установлена";
  const suffix = target.basis === "daily_per_metabolic_bw" ? "/сут" : "";
  if (target.minimum == null && target.maximum == null) return target.source_value_text || "Не установлена";
  if (target.minimum != null && target.maximum != null) return `${formatNumber(target.minimum)}–${formatNumber(target.maximum)} ${target.unit}${suffix}`;
  if (target.minimum != null) return `≥ ${formatNumber(target.minimum)} ${target.unit}${suffix}`;
  return `≤ ${formatNumber(target.maximum)} ${target.unit}${suffix}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function CheckField({ label, checked, onChecked }: { label: string; checked: boolean; onChecked: (value: boolean) => void }) {
  const id = React.useId();
  return <div className="flex items-center gap-2"><Checkbox id={id} checked={checked} onCheckedChange={(value) => onChecked(value === true)} /><Label htmlFor={id} className="font-normal">{label}</Label></div>;
}
