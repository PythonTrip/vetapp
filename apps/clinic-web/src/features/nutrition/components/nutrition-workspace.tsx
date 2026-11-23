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
import { FoodCatalog } from "@/features/nutrition/components/food-catalog";
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
  const assessmentAnimal = React.useMemo(() => {
    try {
      return toAssessmentAnimal(animal);
    } catch {
      return null;
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

  function changeProfile(selection: ProfileSelection) {
    setProfileDraft(selection);
    setConfirmed(null);
    if (activeSelection) invalidateAssessment();
  }

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
    <div className="mx-auto min-w-0 w-full max-w-[1600px] space-y-3 overflow-x-hidden p-3 sm:p-4 lg:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-[-0.02em] sm:text-2xl">{plan.data?.name ?? "Питание / Расчёт рациона"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.data ? `Сохранённый план · ${plan.data.assessment_snapshot.standard_code.toUpperCase()} ${plan.data.edition_code}` : "Рабочее место ветеринарного диетолога · автоматический пересчёт"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!historicalSnapshotLocked ? <Button asChild type="button" size="sm" variant="outline">
            <a href="#nutrition-profile">Профиль оценки</a>
          </Button> : null}
          <Button
          type="button"
          size="sm"
          onClick={() => setSaveOpen(true)}
          disabled={historicalSnapshotLocked || !assessment.data?.normative_comparison_performed || assessmentDirty || !activeSelection}
        >
          {planId ? <RefreshCw className="size-4" /> : <Save className="size-4" />}
          {planId ? "Пересчитать и сохранить" : "Сохранить план"}
          </Button>
        </div>
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
          ) : null}

          <div className="min-w-0 space-y-3">
          <fieldset disabled={historicalSnapshotLocked} className="min-w-0">
            <ClinicalContextSummary
              animal={animal}
              patient={selectedPatient.data ?? null}
              selectedPatientId={selectedPatientId}
              selectedPatientPending={Boolean(selectedPatientId) && selectedPatient.isPending}
              onPatientChange={handlePatientChange}
              patientError={selectedPatientId && selectedPatient.isError ? apiErrorMessage(selectedPatient.error) : null}
              standard={resolvedProfileCode ? resolvedStandardLabel(
                resolvedProfileCode,
                displayedAssessment?.edition.code ?? activeSelection?.edition ?? "",
                displayedAssessment?.edition.standard_code ?? activeSelection?.standard_code ?? "fediaf",
              ) : "Профиль не подтверждён"}
            >
              <AnimalContextPanel
                animal={animal}
                disabled={historicalSnapshotLocked || patientContextPending}
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
              />
            </ClinicalContextSummary>
          </fieldset>

            {!historicalSnapshotLocked ? <ProfilePanel
              animal={patientContextPending ? null : assessmentAnimal}
              draft={profileDraft}
              confirmed={Boolean(activeSelection)}
              stale={confirmed !== null && !activeSelection}
              onDraft={changeProfile}
              onConfirm={confirmProfile}
            /> : null}

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
          </div>
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
          <Field label="Название"><Input value={name} onChange={(event) => onName(event.target.value)} maxLength={255} /></Field>
          <p className="text-sm text-muted-foreground">
            {selectedPatient ? `Пациент · ${selectedPatient.name}` : "План без привязки к пациенту"}
          </p>
          <Field label="Заметки"><Textarea value={notes} onChange={(event) => onNotes(event.target.value)} rows={4} /></Field>
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
  standard,
  children,
}: {
  animal: NutritionAnimalForm;
  patient: PatientRecord | null;
  selectedPatientId: string;
  selectedPatientPending: boolean;
  onPatientChange: (value: string) => void;
  patientError: string | null;
  standard: string | null;
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
          <span className="min-w-0 truncate font-medium text-foreground">{standard}</span>
          <span className="text-muted-foreground">· {lifeStage}</span>
        </div>
        {patientError ? <p className="mt-2 text-xs text-destructive" role="alert">{patientError}</p> : null}
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
        {showPregnancy && animal.species === "dog" ? <Field label="Неделя беременности"><Input aria-label="Неделя беременности" className="h-9 max-w-40 shadow-none" inputMode="numeric" value={animal.gestationWeek} onChange={(event) => onPatch({ gestationWeek: event.target.value })} disabled={disabled} /></Field> : null}
        {showLactation ? <Field label="Неделя лактации"><Input aria-label="Неделя лактации" className="h-9 max-w-40 shadow-none" inputMode="numeric" value={animal.lactationWeek} onChange={(event) => onPatch({ lactationWeek: event.target.value })} disabled={disabled} /></Field> : null}
        {showLactation ? <Field label="Размер помёта"><Input aria-label="Размер помёта" className="h-9 max-w-40 shadow-none" inputMode="numeric" value={animal.litterSize} onChange={(event) => onPatch({ litterSize: event.target.value })} disabled={disabled} /></Field> : null}
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
  const factor = assessmentEnergy?.rer_factor ?? estimate.data?.rer_factor ?? Number(rerFactor.replace(",", "."));
  const rer = assessmentEnergy ? assessmentEnergy.rer_kcal_day : estimate.data?.rer_kcal_day ?? null;
  const rerAdjusted = assessmentEnergy ? assessmentEnergy.rer_factor_kcal_day : estimate.data?.rer_factor_kcal_day ?? null;
  const adjustmentValue = Number(adjustment.replace(",", "."));
  const missingFields = assessmentEnergy?.missing_fields ?? estimate.data?.missing_fields ?? [];
  const outsideGrowthScope = missingFields.includes("growth_age_outside_formula_scope");
  const visibleMissingFields = Array.from(new Set(missingFields.filter((field) => field !== "growth_age_outside_formula_scope").map(humanFieldLabel)));
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
          label="RER × коэффициент"
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
      {outsideGrowthScope ? <p className="mt-4 text-xs text-amber-800 dark:text-amber-300">Возраст пациента вне диапазона энергетической формулы роста.</p> : null}
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
        <Button type="button" size="sm" className="h-8 self-start rounded-md lg:self-auto" onClick={onOpenAdd} disabled={readOnly}>
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
            onClick={() => { setMode(item.value); setStatusFilter("all"); }}
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

      <div className="max-h-[calc(100dvh-20rem)] min-h-[22rem] overflow-auto scrollbar-thin">
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
                    {row ? (
                      <button type="button" className="underline decoration-dotted underline-offset-2 focus-visible:outline-ring"
                        aria-label={`Подробнее: ${nutrient.name}`} onClick={() => setSelectedNutrientKey(nutrient.key)}>
                        {value == null ? "—" : formatNumber(value, 2)}
                      </button>
                    ) : value == null ? "—" : formatNumber(value, 2)}
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
