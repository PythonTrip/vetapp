"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  FolderOpen,
  Info,
  Loader2,
  PawPrint,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { FoodCatalog } from "@/features/nutrition/components/food-catalog";
import type { CategorySelection } from "@/features/nutrition/components/category-selection";
import { ProfilePanel } from "@/features/nutrition/components/profile-panel";
import { PatientPicker } from "@/features/nutrition/components/patient-picker";
import { RationAddDialog } from "@/features/nutrition/components/ration-add-dialog";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Textarea } from "@/shared/ui/textarea";
import { type AssessmentRecord, type AssessmentEnergyRecord, type AssessmentRequestPayload, type AssessmentStatus, type DietPlanRecord, type DietPlanSummaryRecord, type FeedForm, type FoodSummaryRecord, type NutrientCategory, type NutrientRecord, type ProfileSelection } from "@/features/nutrition/api";
import { type PatientRecord } from "@/features/patients/api";
import { useAssessmentSuggestions, useCreateAssessment, useCreateDietPlan, useDietPlanQuery, useDietPlansQuery, useEnergyEstimate, useNutrientsQuery, useUpdateDietPlan } from "@/features/nutrition/hooks";
import { usePatientQuery } from "@/features/patients/hooks";
import { ApiError } from "@/shared/api/client";
import { apiErrorMessage } from "@/shared/api/error-message";
import { LIFE_STAGE_OPTIONS, ACTIVITY_OPTIONS, SPECIES_OPTIONS } from "@/features/patients/form";
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
} from "@/features/nutrition/model";
import {
  canonicalNutrientCode,
  NUTRIENT_COLUMNS,
  orderedNutrients,
} from "@/features/nutrition/nutrient-columns";
import { cn } from "@/shared/lib/utils";

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

function resolvedStandardLabel(code: string, edition: string, standardCode: string): string {
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
  return `${standardCode.toUpperCase()} ${edition} · ${labels[code] ?? code}`;
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
    gestation_week: "неделя беременности",
    litter_size: "размер помёта",
  };
  return labels[field] ?? "дополнительные данные пациента";
}

const EMPTY_SELECTION: ProfileSelection = {
  standard_code: "fediaf", edition: "", profile_code: "", source: "manual",
};
const nutritionAction = "min-h-11 bg-teal-800 text-white hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-teal-800 dark:bg-teal-300 dark:text-teal-950 dark:hover:bg-teal-200 dark:focus-visible:outline-teal-300";
const nutritionTab = "min-h-11 flex-none rounded-none border-0 border-b-2 px-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-teal-800 data-[state=active]:shadow-none sm:px-4 sm:text-sm dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-teal-200";

export function NutritionWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId") ?? "";
  const planId = searchParams.get("planId") ?? "";
  const plan = useDietPlanQuery(planId);
  const recentPlans = useDietPlansQuery();
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
  const [catalogQuery, setCatalogQuery] = React.useState("");
  const [catalogSelection, setCatalogSelection] = React.useState<CategorySelection>(() => new Map());
  const [catalogSidebarOpen, setCatalogSidebarOpen] = React.useState(true);
  const [feedOverride, setFeedOverride] = React.useState<"auto" | "dry" | "wet">("auto");
  const [assessmentAttempt, setAssessmentAttempt] = React.useState(0);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [profileDraft, setProfileDraft] = React.useState(EMPTY_SELECTION);
  const [confirmed, setConfirmed] = React.useState<{ selection: ProfileSelection; contextKey: string } | null>(null);
  const [assessmentDirty, setAssessmentDirty] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [planName, setPlanName] = React.useState("План 1");
  const [planNotes, setPlanNotes] = React.useState("");
  const [selectedPatientId, setSelectedPatientId] = React.useState<string>(patientId);
  const selectedPatient = usePatientQuery(selectedPatientId);
  const patientContextPending = Boolean(selectedPatientId) && hydratedPatientId !== selectedPatientId;
  const { assessmentAnimal, animalInputError } = React.useMemo(() => {
    try {
      return { assessmentAnimal: toAssessmentAnimal(animal), animalInputError: null };
    } catch (cause) {
      return { assessmentAnimal: null, animalInputError: apiErrorMessage(cause) };
    }
  }, [animal]);
  const contextKey = JSON.stringify([selectedPatientId || null, assessmentAnimal]);
  const activeSelection = !patientContextPending && confirmed?.contextKey === contextKey ? confirmed.selection : null;
  const historicalSnapshotLocked = Boolean(planId) && !historicalRecalculationStarted;
  const suggestions = useAssessmentSuggestions(historicalSnapshotLocked || patientContextPending ? null : assessmentAnimal);
  const showExpectedMatureWeight = animal.species === "dog";
  const adjustmentValue = Number(energyAdjustmentPercent.replace(",", "."));
  const factorValue = Number(rerFactor.replace(",", "."));
  const energyEstimate = useEnergyEstimate(!historicalSnapshotLocked && !patientContextPending && assessmentAnimal
    && adjustmentValue > 0 && adjustmentValue <= 300 && factorValue > 0 && factorValue <= 10 ? {
    animal: assessmentAnimal,
    energy_adjustment_percent: adjustmentValue,
    rer_factor: factorValue,
  } : null);
  const nutrients = useNutrientsQuery();
  const historicalPlan = Boolean(plan.data && (
    !plan.data.assessment_snapshot.request.profile_selection
    || !plan.data.assessment_snapshot.assessment.input_hash
  ));
  React.useEffect(() => {
    setHydratedPlanId(null);
    setHistoricalRecalculationStarted(false);
    setProfileDraft(EMPTY_SELECTION);
    setConfirmed(null);
  }, [planId]);

  React.useEffect(() => {
    const storedPlan = plan.data;
    if (!storedPlan || hydratedPlanId === storedPlan.uuid) return;
    const request = storedPlan.assessment_snapshot.request;
    const snapshot = storedPlan.assessment_snapshot;
    const previousSelection = request.profile_selection;
    const rationLines = planToRationLines(storedPlan);
    const restoredAnimal = assessmentAnimalToNutritionForm(request.animal);
    setProfileDraft(previousSelection ?? {
      standard_code: snapshot.standard_code, edition: snapshot.edition,
      profile_code: snapshot.nutrient_profile_code ?? "", source: "manual",
    });
    setConfirmed(previousSelection ? {
      selection: previousSelection,
      contextKey: JSON.stringify([storedPlan.patient_uuid, toAssessmentAnimal(restoredAnimal)]),
    } : null);
    setAnimal(restoredAnimal);
    setLines(rationLines);
    setRerFactor(String(request.rer_factor));
    setEnergyAdjustmentPercent(String(request.energy_adjustment_percent ?? 100));
    setHistoricalRecalculationStarted(false);
    const inferred = inferFeedForm(rationLines);
    setFeedOverride(!request.feed_form || request.feed_form === "unknown" || request.feed_form === inferred
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
    if (!planId) setSelectedPatientId(patientId);
  }, [patientId, planId]);

  React.useEffect(() => {
    if (historicalSnapshotLocked || selectedPatientId === (hydratedPatientId ?? "")) return;
    const nextPatient = selectedPatientId ? selectedPatient.data : undefined;
    if (selectedPatientId && nextPatient?.uuid !== selectedPatientId) return;

    setAnimal(nextPatient ? patientToNutritionAnimal(nextPatient) : emptyNutritionAnimal());
    setRerFactor(String(nextPatient ? defaultRerFactor(nextPatient.species, nextPatient.neutered) : 1.6));
    setEnergyAdjustmentPercent("100");
    assessment.reset();
    setAssessmentDirty(true);
    setHydratedPatientId(nextPatient?.uuid ?? null);
  }, [assessment.reset, historicalSnapshotLocked, hydratedPatientId, selectedPatient.data, selectedPatientId]);

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
    if (!planId) replacePatientQuery(nextPatientId);
    setEnergyAdjustmentPercent("100");
    assessment.reset();
    setAssessmentDirty(true);
    setFormError(null);
    if (!nextPatientId) {
      setAnimal(emptyNutritionAnimal());
      setRerFactor("1.6");
      setHydratedPatientId(null);
    }
  }, [assessment, planId, replacePatientQuery, selectedPatientId]);

  const invalidateAssessment = React.useCallback(() => {
    assessment.reset();
    setAssessmentDirty(true);
    setFormError(null);
  }, [assessment.reset]);

  function confirmProfile(selection: ProfileSelection) {
    setProfileDraft(selection);
    setConfirmed({ selection, contextKey });
    invalidateAssessment();
  }

  function patchAnimal(patch: Partial<NutritionAnimalForm>) {
    setAnimal((current) => ({ ...current, ...patch }));
    invalidateAssessment();
  }

  function startCurrentVersionRecalculation() {
    assessment.reset();
    setConfirmed(null);
    setAssessmentDirty(true);
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

  const buildAssessmentRequest = React.useCallback((): AssessmentRequestPayload => {
    const components = lines.map((line) => ({
      food_uuid: line.food.uuid,
      grams: Number(line.grams.trim().replace(",", ".")),
    }));
    if (!components.length || components.some((item) => !Number.isFinite(item.grams) || item.grams <= 0)) {
      throw new Error("Добавьте продукты и укажите массу каждого компонента больше 0 г");
    }
    const factor = Number(rerFactor.replace(",", "."));
    if (!Number.isFinite(factor) || factor <= 0 || factor > 10) throw new Error("Проверьте коэффициент RER");
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
      profile_mode: "manual",
      profile_selection: activeSelection,
      components,
    };
  }, [activeSelection, animal, effectiveFeedForm, energyAdjustmentPercent, lines, rerFactor]);

  function retryAssessment() {
    invalidateAssessment();
    setAssessmentAttempt((attempt) => attempt + 1);
  }

  async function saveDietPlan() {
    setFormError(null);
    try {
      if (
        !assessment.data?.normative_comparison_performed
        || assessmentDirty
        || !assessment.data.input_hash
        || !activeSelection
      ) {
        throw new Error("Сначала выполните актуальную оценку по текущей версии nutrition engine");
      }
      const payload = {
        name: planName.trim(),
        patient_uuid: selectedPatientId || null,
        notes: planNotes.trim() || null,
        assessment_request: buildAssessmentRequest(),
        expected_input_hash: assessment.data.input_hash,
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
      const message = apiErrorMessage(cause);
      toast.error(message);
      if (cause instanceof ApiError && cause.status === 409) {
        retryAssessment();
        setSaveOpen(false);
      }
    }
  }

  const displayedAssessment = historicalSnapshotLocked
    ? plan.data?.assessment_snapshot.assessment
    : assessmentDirty || patientContextPending ? undefined : assessment.data ?? undefined;
  const rationKcal = displayedAssessment?.ration_energy?.total_kcal_day ?? null;
  const resolvedProfileCode = historicalSnapshotLocked
    ? plan.data?.assessment_snapshot.nutrient_profile_code
    : activeSelection?.profile_code;
  const profileSummary = resolvedProfileCode ? resolvedStandardLabel(
    resolvedProfileCode,
    displayedAssessment?.edition.code ?? activeSelection?.edition ?? "",
    displayedAssessment?.edition.standard_code ?? activeSelection?.standard_code ?? "fediaf",
  ) : null;
  const resolvedFormulaCode = displayedAssessment?.context.energy_formula_code
    ?? suggestions.data?.suggested_energy_formula_code;
  const resolvedFormulaName = suggestions.data?.energy_formula_options.find(
    (item) => item.code === resolvedFormulaCode,
  )?.name_ru ?? resolvedFormulaCode ?? null;
  const resolvedEnergy = displayedAssessment?.energy;
  const workingEnergyKcal = resolvedEnergy?.working_energy_kcal
    ?? energyEstimate.data?.working_energy_kcal
    ?? null;
  const mutateAssessment = assessment.mutateAsync;
  React.useEffect(() => {
    if (!lines.length || historicalSnapshotLocked || patientContextPending) return;

    let payload: AssessmentRequestPayload;
    try {
      payload = buildAssessmentRequest();
    } catch (cause) {
      setFormError(apiErrorMessage(cause));
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void mutateAssessment(payload)
        .then((result) => {
          if (!cancelled && result) setAssessmentDirty(false);
        })
        .catch((cause) => {
          if (!cancelled) setFormError(apiErrorMessage(cause));
        });
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assessmentAttempt, buildAssessmentRequest, mutateAssessment, historicalSnapshotLocked, patientContextPending, lines.length]);

  if (planId && plan.isPending) {
    return <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8" aria-busy="true"><Skeleton className="h-10 w-80" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (planId && plan.isError) {
    return <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8"><p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" role="alert">{apiErrorMessage(plan.error)}</p><Button asChild variant="outline"><Link href="/nutrition"><FolderOpen className="h-4 w-4" />Открыть недавние планы</Link></Button></div>;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1600px] space-y-4 px-3 pt-5 pb-6 sm:px-6 sm:pt-7 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-semibold text-teal-800 dark:text-teal-200">Питание</p>
          <h1 className="text-2xl font-bold tracking-tight wrap-break-word sm:text-3xl">{plan.data?.name ?? "Расчёт рациона"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {plan.data ? `Сохранённый план · ${plan.data.assessment_snapshot.standard_code.toUpperCase()} ${plan.data.edition_code}` : "Параметры пациента, суточная энергия и нутриентный состав"}
          </p>
        </div>
        <Button
          type="button"
          className={cn(nutritionAction, "shrink-0 sm:w-auto")}
          onClick={() => setSaveOpen(true)}
          disabled={historicalSnapshotLocked || !assessment.data?.normative_comparison_performed || assessmentDirty || !activeSelection}
        >
          {planId ? <RefreshCw className="size-4" /> : <Save className="size-4" />}
          {planId ? "Пересчитать и сохранить" : "Сохранить план"}
        </Button>
      </header>

      <Tabs defaultValue="assessment" className="min-w-0 gap-4">
        <TabsList className="h-auto w-full min-w-0 justify-start gap-1 rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="assessment" className={nutritionTab}>Рацион</TabsTrigger>
          <TabsTrigger value="plans" className={nutritionTab}>Недавние планы</TabsTrigger>
          <TabsTrigger value="catalog" className={nutritionTab}>Каталог</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" data-catalog-workbench>
          <FoodCatalog
            query={catalogQuery}
            setQuery={setCatalogQuery}
            selection={catalogSelection}
            setSelection={setCatalogSelection}
            sidebarOpen={catalogSidebarOpen}
            setSidebarOpen={setCatalogSidebarOpen}
          />
        </TabsContent>
        <TabsContent value="plans"><RecentPlans plans={recentPlans.data ?? []} pending={recentPlans.isPending} error={recentPlans.isError ? apiErrorMessage(recentPlans.error) : null} /></TabsContent>
        <TabsContent value="assessment" className="min-w-0 space-y-4 rounded-lg focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-teal-800 dark:focus-visible:outline-teal-300">
          {plan.data ? (
            <SnapshotNotice
              plan={plan.data}
              historical={historicalPlan}
              recalculationStarted={historicalRecalculationStarted}
              onStartCurrentRecalculation={startCurrentVersionRecalculation}
            />
          ) : null}

          <fieldset disabled={historicalSnapshotLocked} className="min-w-0 space-y-4">
            <ClinicalContextSummary
              animal={animal}
              patient={selectedPatient.data ?? null}
              selectedPatientId={selectedPatientId}
              selectedPatientPending={Boolean(selectedPatientId) && selectedPatient.isPending}
              onPatientChange={handlePatientChange}
              patientError={selectedPatientId && selectedPatient.isError ? apiErrorMessage(selectedPatient.error) : null}
              profile={historicalSnapshotLocked ? profileSummary : (
                <ProfilePanel
                  animal={patientContextPending ? null : assessmentAnimal}
                  selection={profileDraft}
                  confirmed={Boolean(activeSelection)}
                  stale={confirmed !== null && !activeSelection}
                  summary={profileSummary}
                  onConfirm={confirmProfile}
                />
              )}
            />
            <div className="@container">
              <div className="grid min-w-0 items-start gap-4 @min-[48rem]:grid-cols-[minmax(0,1.9fr)_minmax(18rem,1fr)]">
                <AnimalContextPanel
                  animal={animal}
                  disabled={historicalSnapshotLocked || patientContextPending}
                  inputError={animalInputError}
                  onPatch={patchAnimal}
                  showExpectedMatureWeight={showExpectedMatureWeight}
                  adjustment={energyAdjustmentPercent}
                  onAdjustment={(value) => {
                    setEnergyAdjustmentPercent(value);
                    invalidateAssessment();
                  }}
                  rerFactor={rerFactor}
                  onRerFactor={(value) => {
                    setRerFactor(value);
                    invalidateAssessment();
                  }}
                />

                <EnergyStrip
                  estimate={energyEstimate}
                  assessmentEnergy={resolvedEnergy}
                  formulaName={resolvedFormulaName}
                  adjustment={energyAdjustmentPercent}
                  rerFactor={rerFactor}
                  currentBodyWeightKg={animal.currentBodyWeightKg}
                  patientStatus={patientContextPending ? selectedPatient.isError ? "error" : "loading" : "ready"}
                  locked={historicalSnapshotLocked}
                />
              </div>
            </div>
          </fieldset>

          {formError ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <p role="alert">{formError}</p>
            {assessment.error ? <Button variant="outline" size="sm" onClick={retryAssessment}>Повторить расчёт</Button> : null}
          </div> : null}

          <RationWorkbench
            lines={lines}
            readOnly={historicalSnapshotLocked}
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
            nutrients={nutrients.data ?? []}
          />
        </TabsContent>
      </Tabs>
      <SavePlanDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        editing={Boolean(planId)}
        name={planName}
        notes={planNotes}
        selectedPatient={selectedPatient.data ?? null}
        pending={createPlan.isPending || updatePlan.isPending}
        onName={setPlanName}
        onNotes={setPlanNotes}
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex items-center gap-1.5 font-semibold"><Save className="size-3.5" /> Сохранённый расчёт</span><span>{plan.assessment_snapshot.standard_code.toUpperCase()} {plan.edition_code}</span><span>{historical ? "Предыдущая методика расчёта" : "Без пересчёта при открытии"}</span></div>
      {!recalculationStarted ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-sky-300/50 pt-2">
          <Button type="button" size="sm" onClick={onStartCurrentRecalculation}>
            <RefreshCw className="h-4 w-4" />
            Редактировать и пересчитать
          </Button>
          <p>Врач подтверждает профиль перед новой оценкой.</p>
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
        {plans.map((item) => <Link key={item.uuid} href={`/nutrition?planId=${item.uuid}`} className="flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"><span><strong>{item.name}</strong><span className="ml-2 text-xs text-muted-foreground">{item.patient?.name ?? "без пациента"}</span></span><span className="text-xs text-muted-foreground">{(item.standard_code ?? "fediaf").toUpperCase()} {item.edition_code}</span></Link>)}
        {!plans.length ? <p className="py-6 text-center text-sm text-muted-foreground">Сохранённых планов пока нет</p> : null}
      </CardContent>
    </Card>
  );
}

function SavePlanDialog({ open, onOpenChange, editing, name, notes, selectedPatient, pending, onName, onNotes, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  name: string;
  notes: string;
  selectedPatient: PatientRecord | null;
  pending: boolean;
  onName: (value: string) => void;
  onNotes: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Пересчитать и сохранить" : "Сохранить план"}</DialogTitle><DialogDescription>{editing ? "Текущий snapshot будет заменён результатом нового серверного расчёта. История версий не создаётся." : "Сервер повторно проверит контекст и рассчитает snapshot перед записью."}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label="Название">{(id) => <Input id={id} value={name} onChange={(event) => onName(event.target.value)} maxLength={255} />}</Field>
          <p className="text-sm text-muted-foreground">
            {selectedPatient ? `Пациент · ${selectedPatient.name}` : "План без привязки к пациенту"}
          </p>
          <Field label="Заметки">{(id) => <Textarea id={id} value={notes} onChange={(event) => onNotes(event.target.value)} rows={4} />}</Field>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Отмена</Button><Button type="button" onClick={onSave} disabled={pending || !name.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <RefreshCw className="h-4 w-4" /> : <Save className="h-4 w-4" />}{editing ? "Пересчитать и сохранить" : "Сохранить план"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClinicalContextSummary({
  animal,
  patient,
  selectedPatientId,
  selectedPatientPending,
  onPatientChange,
  patientError,
  profile,
}: {
  animal: NutritionAnimalForm;
  patient: PatientRecord | null;
  selectedPatientId: string;
  selectedPatientPending: boolean;
  onPatientChange: (value: string) => void;
  patientError: string | null;
  profile: React.ReactNode;
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
    : null;
  const meta = [species, lifeStage, ageText, weightText].filter(Boolean).join(" · ");

  return (
    <section className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-xl border bg-card px-4 py-3 sm:px-5" aria-label="Пациент и профиль оценки">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><PawPrint className="size-5" aria-hidden="true" /></div>
        <div className="min-w-0">
          <PatientPicker
            id="nutrition-patient-picker"
            value={selectedPatientId}
            selected={patient}
            selectedPending={selectedPatientPending}
            onChange={onPatientChange}
            compact
            className="min-h-11 w-auto max-w-full border-transparent bg-transparent px-0 text-left font-semibold shadow-none hover:bg-transparent hover:text-primary"
          />
          {!selectedPatientPending ? <p className="text-xs leading-5 text-muted-foreground">{meta}</p> : null}
          {patientError ? <p className="mt-1 text-xs text-destructive" role="alert">{patientError}</p> : null}
        </div>
      </div>
      <div className="min-w-0 max-w-full text-sm">{profile}</div>
    </section>
  );
}

const patientFieldClass = "min-h-11 w-full min-w-0 shadow-none";

function AnimalContextPanel({ animal, disabled, inputError, onPatch, showExpectedMatureWeight, adjustment, onAdjustment, rerFactor, onRerFactor }: {
  animal: NutritionAnimalForm;
  disabled: boolean;
  inputError: string | null;
  onPatch: (patch: Partial<NutritionAnimalForm>) => void;
  showExpectedMatureWeight: boolean;
  adjustment: string;
  onAdjustment: (value: string) => void;
  rerFactor: string;
  onRerFactor: (value: string) => void;
}) {
  const showPregnancy = animal.lifeStage === "gestation" || animal.pregnant;
  const showLactation = animal.lifeStage === "lactation" || animal.lactating;
  const weightMissing = !animal.currentBodyWeightKg.trim();
  const fieldGrid = "grid min-w-0 gap-3 min-[380px]:grid-cols-2 sm:gap-x-4 @min-[61rem]:grid-cols-3";

  return (
    <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="clinical-context-details">
      <h2 id="clinical-context-details" className="text-lg font-semibold tracking-tight">Параметры пациента</h2>
      <p className="mt-1 text-sm text-muted-foreground">Текущая масса нужна для расчёта энергии.</p>
      {inputError && !disabled ? <p role="status" className="mt-2 text-sm text-destructive">{inputError}</p> : null}
      <div className={cn(fieldGrid, "mt-4")}>
        <Field label="Вид животного">{(id) => (
          <Select value={animal.species} onValueChange={(species) => onPatch({ species: species as NutritionAnimalForm["species"] })} disabled={disabled}>
            <SelectTrigger id={id} className={patientFieldClass}><SelectValue /></SelectTrigger>
            <SelectContent>{SPECIES_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        )}</Field>
        <Field label="Стадия жизни">{(id) => (
          <Select value={animal.lifeStage || "none"} onValueChange={(value) => onPatch({ lifeStage: value === "none" ? "" : value })} disabled={disabled}>
            <SelectTrigger id={id} className={patientFieldClass}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">Не указана</SelectItem>{LIFE_STAGE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        )}</Field>
        <Field label="Возраст">{(id) => (
          <UnitInput id={id} unit="мес" inputMode="decimal" value={animal.ageMonths} onChange={(event) => onPatch({ ageMonths: event.target.value })} disabled={disabled} />
        )}</Field>
        <Field label="Текущая масса" id="nutrition-current-weight">{(id) => (
          <UnitInput id={id} unit="кг" className={weightMissing && !disabled ? "border-amber-600/60 dark:border-amber-400/60" : undefined} inputMode="decimal" value={animal.currentBodyWeightKg} onChange={(event) => onPatch({ currentBodyWeightKg: event.target.value })} disabled={disabled} />
        )}</Field>
        {showExpectedMatureWeight ? (
          <Field label="Ожидаемый взрослый вес">{(id) => (
            <UnitInput id={id} unit="кг" inputMode="decimal" value={animal.expectedMatureWeightKg} onChange={(event) => onPatch({ expectedMatureWeightKg: event.target.value })} disabled={disabled} />
          )}</Field>
        ) : null}
        <Field label="Целевая масса">{(id) => (
          <UnitInput id={id} unit="кг" inputMode="decimal" value={animal.targetBodyWeightKg} onChange={(event) => onPatch({ targetBodyWeightKg: event.target.value })} disabled={disabled} />
        )}</Field>
      </div>

      <div className="mt-5 border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Клинический контекст</h3>
        <div className={fieldGrid}>
          <Field label="Оценка упитанности (BCS)">{(id) => (
            <Select value={animal.bcs || "none"} onValueChange={(value) => onPatch({ bcs: value === "none" ? "" : value })} disabled={disabled}>
              <SelectTrigger id={id} className={patientFieldClass}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Не указана</SelectItem>{Array.from({ length: 9 }, (_, index) => String(index + 1)).map((value) => <SelectItem key={value} value={value}>{value} / 9</SelectItem>)}</SelectContent>
            </Select>
          )}</Field>
          <Field label="Активность">{(id) => (
            <Select value={animal.activity || "none"} onValueChange={(value) => onPatch({ activity: value === "none" ? "" : value })} disabled={disabled}>
              <SelectTrigger id={id} className={patientFieldClass}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Не указана</SelectItem>{ACTIVITY_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          )}</Field>
          <div className="flex items-end">
            <CheckField label="Стерилизован(а)" checked={animal.neutered} disabled={disabled} onChecked={(value) => onPatch({ neutered: value })} />
          </div>
          {(showPregnancy || showLactation) ? (
            <div className="col-span-full flex flex-wrap items-center gap-x-4">
              {showPregnancy ? <CheckField label="Беременность" checked={animal.pregnant} disabled={disabled} onChecked={(value) => onPatch({ pregnant: value })} /> : null}
              {showLactation ? <CheckField label="Лактация" checked={animal.lactating} disabled={disabled} onChecked={(value) => onPatch({ lactating: value })} /> : null}
            </div>
          ) : null}
          {showPregnancy && animal.species === "dog" ? <Field label="Неделя беременности">{(id) => <Input id={id} className={patientFieldClass} inputMode="numeric" value={animal.gestationWeek} onChange={(event) => onPatch({ gestationWeek: event.target.value })} disabled={disabled} />}</Field> : null}
          {showLactation ? <Field label="Неделя лактации">{(id) => <Input id={id} className={patientFieldClass} inputMode="numeric" value={animal.lactationWeek} onChange={(event) => onPatch({ lactationWeek: event.target.value })} disabled={disabled} />}</Field> : null}
          {showLactation ? <Field label="Размер помёта">{(id) => <Input id={id} className={patientFieldClass} inputMode="numeric" value={animal.litterSize} onChange={(event) => onPatch({ litterSize: event.target.value })} disabled={disabled} />}</Field> : null}
        </div>
      </div>
      <details className="group mt-4 border-t">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring">
          Коэффициенты расчёта <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <Field label="Коэффициент RER">{(id) => (
            <Input id={id} className={patientFieldClass} inputMode="decimal" value={rerFactor} onChange={(event) => onRerFactor(event.target.value)} disabled={disabled} />
          )}</Field>
          <Field label="Корректировка энергии">{(id) => (
            <UnitInput id={id} unit="%" inputMode="decimal" value={adjustment} onChange={(event) => onAdjustment(event.target.value)} disabled={disabled} />
          )}</Field>
        </div>
      </details>
    </section>
  );
}

function EnergyStrip({ estimate, assessmentEnergy, formulaName, adjustment, rerFactor, currentBodyWeightKg, patientStatus, locked }: {
  estimate: ReturnType<typeof useEnergyEstimate>;
  assessmentEnergy: AssessmentEnergyRecord | undefined;
  formulaName: string | null;
  adjustment: string;
  rerFactor: string;
  currentBodyWeightKg: string;
  patientStatus: "ready" | "loading" | "error";
  locked: boolean;
}) {
  const workingEnergy = assessmentEnergy?.working_energy_kcal ?? estimate.data?.working_energy_kcal ?? null;
  const rangeMinimum = assessmentEnergy?.reference_energy_min_kcal
    ?? (estimate.data?.value?.kind === "range" ? estimate.data.value.min_kcal_day : null);
  const rangeMaximum = assessmentEnergy?.reference_energy_max_kcal
    ?? (estimate.data?.value?.kind === "range" ? estimate.data.value.max_kcal_day : null);
  const midpointRule = assessmentEnergy?.range_working_point_rule ?? estimate.data?.range_working_point_rule;
  const currentWeight = Number(currentBodyWeightKg.replace(",", "."));
  const factor = assessmentEnergy?.rer_factor ?? estimate.data?.rer_factor ?? Number(rerFactor.replace(",", "."));
  const rer = assessmentEnergy ? assessmentEnergy.rer_kcal_day : estimate.data?.rer_kcal_day ?? null;
  const rerAdjusted = assessmentEnergy ? assessmentEnergy.rer_factor_kcal_day : estimate.data?.rer_factor_kcal_day ?? null;
  const adjustmentValue = Number(adjustment.replace(",", "."));
  const missingFields = assessmentEnergy?.missing_fields ?? estimate.data?.missing_fields ?? [];
  const outsideGrowthScope = missingFields.includes("growth_age_outside_formula_scope");
  const needsWeight = !Number.isFinite(currentWeight) || currentWeight <= 0;
  const visibleMissingFields = Array.from(new Set(missingFields
    .filter((field) => field !== "growth_age_outside_formula_scope")
    .map(humanFieldLabel)))
    .filter((field) => !needsWeight || field !== humanFieldLabel("current_body_weight_kg"));
  const pending = !locked && !assessmentEnergy && (patientStatus === "loading" || (estimate.isPending && !needsWeight));
  return (
    <section className="min-w-0 rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="energy-result-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="energy-result-title" className="text-lg font-semibold tracking-tight">Потребность в энергии</h2>
          <p className="mt-1 text-sm text-muted-foreground">Суточная оценка · ккал/сут</p>
        </div>
        <Info className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-4 rounded-lg bg-primary/5 p-4" role="status">
        {pending ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            {patientStatus === "loading" ? "Загрузка данных пациента…" : "Расчёт энергии…"}
          </span>
        ) : (
          <>
            {workingEnergy == null ? (
              <p className="text-lg font-semibold">{patientStatus === "error" ? "Расчёт недоступен" : "Расчёт ещё не готов"}</p>
            ) : (
              <p className="text-5xl leading-none font-bold tracking-tight text-primary tabular-nums">
                {formatNumber(workingEnergy, 0)}
                <span className="ml-2 inline-block text-sm font-medium tracking-normal text-muted-foreground">ккал/сут</span>
              </p>
            )}
            {formulaName ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{formulaName}</p> : null}
            {rangeMinimum != null && rangeMaximum != null ? (
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Диапазон {formatNumber(rangeMinimum, 0)}–{formatNumber(rangeMaximum, 0)} ккал/сут
                {midpointRule === "midpoint" ? " · рабочая точка — середина" : ""}
              </p>
            ) : null}
          </>
        )}
      </div>
      {!pending && patientStatus === "ready" && ((needsWeight && !locked) || visibleMissingFields.length > 0 || outsideGrowthScope) ? (
        <div className="mt-3 rounded-lg border border-amber-600/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          {needsWeight && !locked ? (
            <Button type="button" variant="link" className="min-h-11 max-w-full justify-start px-0 text-left whitespace-normal text-inherit underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-current"
              onClick={() => document.getElementById("nutrition-current-weight")?.focus()}>
              Указать текущую массу
            </Button>
          ) : null}
          {visibleMissingFields.length ? <p>Для расчёта нужны {visibleMissingFields.join(", ")}.</p> : null}
          {outsideGrowthScope ? <p>Возраст пациента вне диапазона энергетической формулы роста.</p> : null}
        </div>
      ) : null}
      {estimate.error ? <p role="alert" className="mt-3 text-sm text-destructive">{apiErrorMessage(estimate.error)}</p> : null}

      <dl className="mt-3 divide-y text-sm">
        <ResultMetric
          label="RER · базовая потребность"
          value={rer == null ? "—" : `${formatNumber(rer, 1)} ккал/сут`}
        />
        <ResultMetric label="Множитель RER" value={Number.isFinite(factor) && factor > 0 ? `× ${formatNumber(factor)}` : "—"} />
        <ResultMetric label="Корректировка энергии" value={Number.isFinite(adjustmentValue) ? `${formatNumber(adjustmentValue, 1)}%` : "—"} />
      </dl>

      <details className="group border-t text-sm text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring">
          Метод расчёта <ChevronDown className="size-4 shrink-0 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <p>RER = 70 × масса<sup>0,75</sup>.</p>
        {rer != null && rerAdjusted != null && Number.isFinite(factor) ? (
          <p>RER × коэффициент = {formatNumber(rer, 1)} × {formatNumber(factor)} = {formatNumber(rerAdjusted, 1)} ккал/сут.</p>
        ) : null}
      </details>
    </section>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{value}</dd>
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
  readOnly,
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
  nutrients,
}: {
  lines: RationLine[];
  readOnly: boolean;
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
  nutrients: NutrientRecord[];
}) {
  const [mode, setMode] = React.useState<NutrientTableMode>("deviations");
  const [selectedFoodId, setSelectedFoodId] = React.useState<string | null>(null);
  const [selectedNutrientKey, setSelectedNutrientKey] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<AssessmentStatus | "all">("all");
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
  const visibleNutrients = nutrientsForMode(mode).filter((item) => (
    statusFilter === "all" || item.assessmentRows?.some((row) => row.status === statusFilter)
  ));
  const selectedNutrient = allTableNutrients.find((item) => item.key === selectedNutrientKey);

  const target = workingEnergyKcal ?? 0;
  const hasTarget = target > 0;
  const energyPercent = assessment?.ration_energy?.coverage_percent ?? null;
  const energyDifference = assessment?.ration_energy?.difference_kcal_day ?? null;
  const hasUpperLimits = assessment?.rows.some((row) => row.target?.maximum != null);
  const contextualFeedFormRequired = lines.length > 0 && inferredFeedForm === "unknown";
  const energyItems = new Map(assessment?.ration_energy?.items.map((item) => [item.food_uuid, item]));
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
    if (!assessment?.normative_comparison_performed) return "—";
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
    <Card className="min-w-0 gap-0 overflow-hidden rounded-xl py-0 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Рацион</h2>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">Продуктов · {lines.length}</span>
        </div>
        <Button type="button" className={nutritionAction} onClick={onOpenAdd} disabled={readOnly}>
          <Plus aria-hidden="true" />Добавить продукт
        </Button>
      </div>
      <div className="space-y-2 border-b px-4 pt-3 pb-4 sm:px-5">
        <h3 className="text-sm font-semibold">Нутриентный состав</h3>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          <strong className="text-sm">
            {rationKcal == null ? "—" : formatNumber(rationKcal, 0)}
            {" / "}
            {hasTarget ? formatNumber(target, 0) : "—"} ккал
          </strong>
          <span className="text-muted-foreground">
            {energyPercent == null ? "покрытие —" : formatNumber(energyPercent, 0) + "%"}
          </span>
          {assessment?.ration_energy && rationKcal == null ? (
            <span className="text-amber-800 dark:text-amber-300">
              ME неполная · известно {formatNumber(assessment.ration_energy.known_kcal_day, 1)} ккал
            </span>
          ) : null}
          <span className={cn(
            energyDifference != null && energyDifference < 0 ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground",
          )}>
            {energyDifference == null ? "разница —" : (energyDifference > 0 ? "+" : "") + formatNumber(energyDifference, 0) + " ккал"}
          </span>
          {assessment?.normative_comparison_performed ? <>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span className="text-emerald-700 dark:text-emerald-300">✓ {assessment?.met_count ?? 0} в норме</span>
          <span className="text-amber-800 dark:text-amber-300">↓ {assessment?.below_minimum_count ?? 0} ниже цели</span>
          {hasUpperLimits ? <span className="text-red-700 dark:text-red-300">↑ {assessment.above_maximum_count ?? 0} выше максимума</span> : null}
          <button
            type="button"
            onClick={() => setDetailsOpen((value) => !value)}
            className="text-violet-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-violet-300"
          >
            ? {assessment?.unevaluable_count ?? 0} нет данных
          </button>
          </> : null}
          {assessmentPending ? <span className="flex items-center gap-1.5 text-primary" role="status"><Loader2 className="size-3.5 animate-spin" />Пересчёт…</span> : dirty && lines.length ? <span className="text-muted-foreground">Оценка ожидает пересчёта</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b bg-muted/30 px-3 py-2" role="group" aria-label="Группы нутриентов">
        {NUTRIENT_MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={mode === item.value}
            onClick={() => { setMode(item.value); setStatusFilter("all"); }}
            className={cn(
              "flex min-h-11 max-w-full items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-teal-800 dark:focus-visible:outline-teal-300",
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

      {assessment?.normative_comparison_performed ? (
        <label className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          Статус
          <select className="h-8 rounded-md border bg-background px-2" value={statusFilter} onChange={(event) => {
            const next = event.target.value as AssessmentStatus | "all";
            setStatusFilter(next);
            if (mode === "deviations" && (next === "met" || next === "not_applicable")) setMode("main");
          }}>
            <option value="all">Все</option>
            {Object.entries(STATUS).map(([code, item]) => <option key={code} value={code}>{item.label}</option>)}
          </select>
        </label>
      ) : null}

      {assessment?.gate ? (
        <div className="flex items-start gap-2 border-b border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/20 dark:text-amber-200" role="alert">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span><strong>Нормативное сравнение остановлено.</strong> {assessment.gate.explanation_ru}</span>
        </div>
      ) : null}

      {contextualFeedFormRequired && !readOnly ? (
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

      <div role="region" aria-label="Таблица нутриентного состава" tabIndex={0} className="scrollbar-thin max-h-[max(14rem,calc(100dvh-20rem))] overflow-auto focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <table className="w-max min-w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="hidden w-28 sm:table-column" />
            <col className="w-48 sm:w-64" />
            <col className="w-28" />
            {visibleNutrients.map((nutrient) => <col key={nutrient.key} className="w-24" />)}
          </colgroup>
          <thead className="sticky top-0 z-40 bg-muted text-muted-foreground">
            <tr className="h-11 border-b">
              <th scope="col" className="hidden sm:table-cell lg:sticky lg:left-0 top-0 z-50 w-28 min-w-28 border-r bg-muted px-2.5 text-left font-semibold">Категория</th>
              <th scope="col" className="lg:sticky lg:left-28 top-0 z-50 w-48 min-w-48 sm:w-64 sm:min-w-64 border-r bg-muted px-3 text-left font-semibold">Название</th>
              <th scope="col" className="lg:sticky lg:left-[23rem] top-0 z-50 w-28 min-w-28 border-r bg-muted px-2 text-right font-semibold">
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
              <th className="hidden sm:table-cell lg:sticky lg:left-0 z-30 border-r bg-slate-50 px-2.5 text-left text-[11px] font-semibold dark:bg-slate-900">Цель</th>
              <th className="lg:sticky lg:left-28 z-30 border-r bg-slate-50 px-3 text-left font-semibold dark:bg-slate-900">{assessment?.normative_comparison_performed ? `${(assessment.edition.standard_code ?? "fediaf").toUpperCase()} ${assessment.edition.code}` : "Профиль оценки"}</th>
              <td className="lg:sticky lg:left-[23rem] z-30 border-r bg-slate-50 dark:bg-slate-900" />
              {visibleNutrients.map((nutrient) => (
                <td key={nutrient.key} className="border-r px-2 text-right text-[11px]" title={nutrient.assessmentRows?.map((row) => targetText(row.target)).join(" · ") || "Цель ещё не рассчитана"}>
                  {nutrient.assessmentRows?.length && nutrient.assessmentRows.length > 1 && nutrient.assessmentRows.every((row) => row.status === "insufficient_context")
                    ? "уточнить"
                    : nutrient.assessmentRow ? targetValueText(nutrient.assessmentRow.target) : "—"}
                </td>
              ))}
            </tr>
            <tr className="h-10 border-b-2 border-primary/25 bg-emerald-50/70 font-semibold dark:bg-emerald-950/20">
              <th className="hidden sm:table-cell lg:sticky lg:left-0 z-30 border-r bg-emerald-50 px-2.5 text-left text-[11px] dark:bg-emerald-950">Итого</th>
              <th className="lg:sticky lg:left-28 z-30 border-r bg-emerald-50 px-3 text-left dark:bg-emerald-950">Рацион</th>
              <td className="lg:sticky lg:left-[23rem] z-30 border-r bg-emerald-50 px-2 text-right dark:bg-emerald-950">
                {lines.reduce((sum, line) => {
                  const grams = Number(line.grams.replace(",", "."));
                  return sum + (Number.isFinite(grams) ? grams : 0);
                }, 0).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
              </td>
              {visibleNutrients.map((nutrient) => {
                const row = nutrient.assessmentRow;
                const status = row ? STATUS[row.status] : null;
                const value = row
                  ? rowComparisonAmount(row)
                  : nutrient.code === "ME" ? rationKcal : null;
                const known = row && value == null ? rowComparisonLowerBound(row) : null;
                const text = known == null ? formatNumber(value, 2) : `≥ ${formatNumber(known, 2)}`;
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
                    {status && value == null && known == null ? (
                      <span className="mr-1" aria-hidden="true">{status.symbol}</span>
                    ) : null}
                    {row ? (
                      <button type="button" className="underline decoration-dotted underline-offset-2 focus-visible:outline-ring"
                        aria-label={`Подробнее: ${nutrient.name}`} onClick={() => setSelectedNutrientKey(nutrient.key)}>
                        {text}
                      </button>
                    ) : text}
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
                  "hidden sm:table-cell lg:sticky lg:left-0 z-20 max-w-28 truncate border-r bg-card px-2.5 text-[11px] text-muted-foreground group-hover:bg-accent",
                  selectedFoodId === line.food.uuid && "bg-accent",
                )} title={foodCategoryLabel(line)}>
                  {foodCategoryLabel(line)}
                </td>
                <th className={cn(
                  "lg:sticky lg:left-28 z-20 border-r bg-card px-3 text-left font-medium group-hover:bg-accent",
                  selectedFoodId === line.food.uuid && "bg-accent",
                )} scope="row">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{line.food.name}</p>
                      <p className="truncate text-[10px] font-normal text-muted-foreground">
                        {line.food.subcategory ?? foodCategoryLabel(line)}
                      </p>
                      {energyItems.has(line.food.uuid) ? (
                        <p className="truncate text-[10px] font-normal text-muted-foreground" title={energyItems.get(line.food.uuid)?.warning ?? energyItems.get(line.food.uuid)?.source ?? undefined}>
                          {energyItems.get(line.food.uuid)?.me_kcal_per_100g == null ? "ME · нет данных"
                            : `${formatNumber(energyItems.get(line.food.uuid)?.me_kcal_per_100g ?? null, 1)} ккал/100 г · ${formatNumber(energyItems.get(line.food.uuid)?.kcal_day ?? null, 1)} ккал/сут`}
                          {energyItems.get(line.food.uuid)?.quality === "estimated" ? " · оценка" : ""}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                      disabled={readOnly}
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
                  "lg:sticky lg:left-[23rem] z-20 border-r bg-card px-1.5 group-hover:bg-accent",
                  selectedFoodId === line.food.uuid && "bg-accent",
                )}>
                  <Input
                    aria-label={"Количество, г/сут: " + line.food.name}
                    inputMode="decimal"
                    readOnly={readOnly}
                    value={line.grams}
                    onChange={(event) => onGrams(line.food.uuid, event.target.value)}
                    onFocus={() => setSelectedFoodId(line.food.uuid)}
                    className="h-8 rounded-md px-2 text-right text-xs tabular-nums"
                  />
                </td>
                {visibleNutrients.map((nutrient) => (
                  <td key={nutrient.key} className="border-r px-2 text-right">
                    {canonicalNutrientCode(nutrient.code) === "ME"
                      ? formatNumber(energyItems.get(line.food.uuid)?.kcal_day ?? null)
                      : formatNumber(nutrient.assessmentRow?.contributions?.find((item) => item.food_uuid === line.food.uuid)?.daily_amount ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!lines.length ? (
        <div className="border-t px-4 py-5 text-sm sm:px-5">
          <p className="font-medium">Рацион пока пуст</p>
          <p className="mt-1 text-muted-foreground">Нутриентный состав появится после добавления продуктов.</p>
        </div>
      ) : null}

      {mode === "deviations" && statusFilter === "all" && assessment?.normative_comparison_performed && visibleNutrients.length === 0 ? (
        <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <Check className="size-3.5" />В оценённых показателях отклонений нет.
        </div>
      ) : null}

      <Dialog open={Boolean(selectedNutrient)} onOpenChange={(open) => { if (!open) setSelectedNutrientKey(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedNutrient?.name}</DialogTitle>
            <DialogDescription>{assessment?.edition.standard_code?.toUpperCase()} {assessment?.edition.code}</DialogDescription>
          </DialogHeader>
          {selectedNutrient?.assessmentRows?.map((row, index) => (
            <section key={index} className="space-y-2 rounded-md border p-3 text-sm">
              <p className={STATUS[row.status].className}>{STATUS[row.status].label}</p>
              {row.ration_daily_amount != null ? <p>Поступление · {formatNumber(row.ration_daily_amount)} {row.unit}/сут</p> : null}
              {row.ration_ratio != null ? <p>Расчётное значение · {formatNumber(row.ration_ratio)} {row.unit}</p> : null}
              {row.intake_bases ? <details className="text-xs">
                <summary className="cursor-pointer">Другие базисы поступления</summary>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 pt-1">
                  <dt>На 100 г продукта</dt><dd>{formatNumber(row.intake_bases.per_100g_as_fed)} {row.unit}</dd>
                  <dt>На 100 г сухого вещества</dt><dd>{formatNumber(row.intake_bases.per_100g_dry_matter)} {row.unit}</dd>
                  <dt>На кг текущей массы</dt><dd>{formatNumber(row.intake_bases.per_kg_bw)} {row.unit}</dd>
                  <dt>На кг метаболической массы</dt><dd>{formatNumber(row.intake_bases.per_kg_metabolic_bw)} {row.unit}</dd>
                </dl>
              </details> : null}
              {row.target ? <p>Цель · {targetText(row.target)}</p> : null}
              {row.published_target?.basis === "per_1000_kcal_me" ? (
                <p>Плотность · {formatNumber(row.ration_per_1000_kcal_me ?? null)} {row.unit}/1000 ккал ME · {row.density_status ? STATUS[row.density_status].label : "оценка недоступна"}<br />
                  Норматив плотности · {targetText(row.published_target)}</p>
              ) : null}
              {row.target?.category === "recommended_minimum" ? <p className="text-xs text-muted-foreground">Рекомендуемый минимум. Отклонение от цели само по себе не устанавливает клинический диагноз.</p> : null}
              {row.note_ru ? <p>{row.note_ru}</p> : null}
              {row.contributions?.length ? (
                <dl className="space-y-1 border-t pt-2">
                  {row.contributions.map((item) => (
                    <div key={item.food_uuid} className="flex justify-between gap-2">
                      <dt>{lines.find((line) => line.food.uuid === item.food_uuid)?.food.name}</dt>
                      <dd>{formatNumber(item.daily_amount)} {row.unit}/сут</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <a href={row.source.url} target="_blank" rel="noreferrer" className="block text-xs underline underline-offset-2">
                {row.source.title}{row.source.table ? ` · ${row.source.table}` : ""}{row.source.page ? ` · стр. ${row.source.page}` : ""}
              </a>
            </section>
          ))}
        </DialogContent>
      </Dialog>

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
              {assessment ? <p>{(assessment.edition.standard_code ?? "fediaf").toUpperCase()} {assessment.edition.code} · покрытие {formatNumber(assessment.coverage.percent, 1)}%</p> : null}
            </div>
          </details>
        </div>
      ) : null}
    </Card>
  );
}

function rowComparisonAmount(row: AssessmentRecord["rows"][number]): number | null {
  const intake = row.intake_bases;
  switch (row.target?.basis) {
    case "per_day": return row.ration_daily_amount ?? null;
    case "per_1000_kcal_me": return row.ration_per_1000_kcal_me;
    case "per_100g_as_fed": return intake?.per_100g_as_fed ?? null;
    case "per_100g_dry_matter": return intake?.per_100g_dry_matter ?? null;
    case "per_kg_bw": return intake?.per_kg_bw ?? null;
    case "per_kg_metabolic_bw": return intake?.per_kg_metabolic_bw ?? null;
    default: return row.ration_ratio ?? row.ration_daily_amount ?? row.ration_per_1000_kcal_me;
  }
}

function rowComparisonLowerBound(row: AssessmentRecord["rows"][number]): number | null {
  if (row.unit === "ratio" || row.ration_ratio != null) return null;

  switch (row.target?.basis) {
    case "ratio":
    case "per_1000_kcal_me":
    case "per_100g_as_fed":
    case "per_100g_dry_matter":
    case "per_kg_bw":
    case "per_kg_metabolic_bw":
      return null;
    case "per_day":
      break;
    default:
      if (row.ration_daily_amount == null && row.ration_per_1000_kcal_me != null) return null;
  }

  let known: number | null = null;
  for (const contribution of row.contributions ?? []) {
    if (contribution.daily_amount != null) {
      known = (known ?? 0) + contribution.daily_amount;
    }
  }
  return known ?? (row.status === "missing_product_data" ? 0 : null);
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
  const suffix = ({
    per_day: "/сут",
    per_1000_kcal_me: "/1000 ккал ME",
    per_100g_as_fed: "/100 г продукта",
    per_100g_dry_matter: "/100 г СВ",
    per_kg_bw: "/кг массы",
    per_kg_metabolic_bw: "/кг метаболической массы",
    daily_per_metabolic_bw: "/кг метаболической массы/сут",
  } as Record<string, string>)[target.basis] ?? "";
  if (target.minimum == null && target.maximum == null) return target.source_value_text || "Не установлена";
  if (target.minimum != null && target.maximum != null) return `${formatNumber(target.minimum)}–${formatNumber(target.maximum)} ${target.unit}${suffix}`;
  if (target.minimum != null) return `≥ ${formatNumber(target.minimum)} ${target.unit}${suffix}`;
  return `≤ ${formatNumber(target.maximum)} ${target.unit}${suffix}`;
}

function Field({ label, id, children }: { label: string; id?: string; children: (id: string) => React.ReactNode }) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  return <div className="flex min-w-0 flex-col justify-end gap-1.5"><Label htmlFor={fieldId} className="leading-snug">{label}</Label>{children(fieldId)}</div>;
}

function UnitInput({ unit, className, ...props }: React.ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input className={cn(patientFieldClass, "pr-12", className)} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">{unit}</span>
    </div>
  );
}

function CheckField({ label, checked, disabled, onChecked }: { label: string; checked: boolean; disabled: boolean; onChecked: (value: boolean) => void }) {
  const id = React.useId();
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Checkbox id={id} aria-labelledby={`${id}-label`} checked={checked} disabled={disabled} onCheckedChange={(value) => onChecked(value === true)} />
      <Label id={`${id}-label`} htmlFor={id} className="min-h-11 font-normal">{label}</Label>
    </div>
  );
}
