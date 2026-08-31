import type {
  AssessmentAnimal,
  DietPlanRecord,
  FeedForm,
  FoodSummaryRecord,
  PatientRecord,
  Species,
} from "@/lib/api-client";

export type NutritionAnimalForm = {
  species: Species;
  currentBodyWeightKg: string;
  targetBodyWeightKg: string;
  expectedMatureWeightKg: string;
  ageMonths: string;
  lifeStage: string;
  activity: string;
  neutered: boolean;
  pregnant: boolean;
  lactating: boolean;
  lactationWeek: string;
  litterSize: string;
  bcs: string;
};

export type RationLine = {
  food: FoodSummaryRecord;
  grams: string;
};

export const emptyNutritionAnimal = (): NutritionAnimalForm => ({
  species: "dog",
  currentBodyWeightKg: "",
  targetBodyWeightKg: "",
  expectedMatureWeightKg: "",
  ageMonths: "",
  lifeStage: "adult",
  activity: "moderate",
  neutered: true,
  pregnant: false,
  lactating: false,
  lactationWeek: "",
  litterSize: "",
  bcs: "",
});

function optionalNumber(value: string, label: string, positive = false): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || (positive && number <= 0)) {
    throw new Error(`Проверьте поле «${label}»`);
  }
  return number;
}

export function toAssessmentAnimal(values: NutritionAnimalForm): AssessmentAnimal {
  return {
    species: values.species,
    current_body_weight_kg: optionalNumber(values.currentBodyWeightKg, "Текущая масса", true),
    target_body_weight_kg: optionalNumber(values.targetBodyWeightKg, "Целевая масса", true),
    expected_mature_weight_kg: optionalNumber(values.expectedMatureWeightKg, "Ожидаемый взрослый вес", true),
    age_months: optionalNumber(values.ageMonths, "Возраст в месяцах"),
    life_stage: values.lifeStage || null,
    activity: values.activity || null,
    neutered: values.neutered,
    pregnant: values.pregnant,
    lactating: values.lactating,
    lactation_week: optionalNumber(values.lactationWeek, "Неделя лактации"),
    litter_size: optionalNumber(values.litterSize, "Размер помёта"),
    bcs: optionalNumber(values.bcs, "BCS"),
  };
}

export function assessmentAnimalToNutritionForm(animal: AssessmentAnimal): NutritionAnimalForm {
  const text = (value: number | null) => value == null ? "" : String(value);
  return {
    species: animal.species,
    currentBodyWeightKg: text(animal.current_body_weight_kg),
    targetBodyWeightKg: text(animal.target_body_weight_kg),
    expectedMatureWeightKg: text(animal.expected_mature_weight_kg),
    ageMonths: text(animal.age_months),
    lifeStage: animal.life_stage ?? "",
    activity: animal.activity ?? "",
    neutered: animal.neutered,
    pregnant: animal.pregnant,
    lactating: animal.lactating,
    lactationWeek: text(animal.lactation_week),
    litterSize: text(animal.litter_size),
    bcs: text(animal.bcs),
  };
}

export function planToRationLines(plan: DietPlanRecord): RationLine[] {
  return plan.ration.map((item) => ({
    food: {
      uuid: item.food_uuid,
      name: item.food_name,
      type: item.food_type,
      feed_form: item.feed_form,
      category: null,
      subcategory: null,
      created_at: plan.created_at,
      updated_at: plan.updated_at,
    },
    grams: String(item.grams),
  }));
}

function ageMonthsFromBirthDate(birthDate: string | null): string {
  if (!birthDate) return "";
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  const months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth();
  return String(Math.max(0, months));
}

export function patientToNutritionAnimal(patient: PatientRecord): NutritionAnimalForm {
  return {
    species: patient.species,
    currentBodyWeightKg: patient.body_weight_kg == null ? "" : String(patient.body_weight_kg),
    targetBodyWeightKg: "",
    expectedMatureWeightKg: patient.expected_adult_weight_kg == null ? "" : String(patient.expected_adult_weight_kg),
    ageMonths: ageMonthsFromBirthDate(patient.birth_date),
    lifeStage: patient.life_stage ?? "",
    activity: patient.activity ?? "",
    neutered: patient.neutered,
    pregnant: patient.pregnant,
    lactating: patient.lactating,
    lactationWeek: patient.lactation_week == null ? "" : String(patient.lactation_week),
    litterSize: patient.litter_size == null ? "" : String(patient.litter_size),
    bcs: patient.bcs == null ? "" : String(patient.bcs),
  };
}

export function inferFeedForm(lines: RationLine[]): FeedForm {
  const positive = lines.filter((line) => Number(line.grams.replace(",", ".")) > 0);
  if (!positive.length) return "unknown";
  const forms = new Set(positive.map((line) => line.food.feed_form));
  if (forms.size === 1 && (forms.has("dry") || forms.has("wet"))) {
    return positive[0].food.feed_form;
  }
  return "unknown";
}

export function defaultRerFactor(species: Species, neutered: boolean): number {
  if (species === "cat") return neutered ? 1.2 : 1.4;
  if (species === "dog") return neutered ? 1.6 : 1.8;
  return 1.6;
}
