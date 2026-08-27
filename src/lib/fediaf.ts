// Typed access layer over the generated FEDIAF 2025 dataset (fediaf-data.ts).
//
// Two things the Nutritionist Assistant consumes:
//  1. Nutrient minimums per 1000 kcal ME, remapped onto the app's own nutrient
//     codes/units so the diet analysis can compare a ration against FEDIAF.
//  2. Daily-energy (MER) formulas, evaluated for the common life stages so the
//     RER/MER calculator can show a FEDIAF estimate next to the RER × factor one.
//
// Reference floors are informational — clinical decisions must be checked
// against the current FEDIAF tables.

import type { LifeStage, ActivityLevel, Species } from "./types";
import {
  FEDIAF_NUTRIENT_STAGES, FEDIAF_ENERGY_FORMULAS, FEDIAF_SIZE_CLASSES,
  FEDIAF_LACTATION_RULES,
  type FediafStage, type FediafSpecies, type FediafEnergyFormula,
  type FediafSizeClass,
} from "./fediaf-data";

export type FediafSpeciesKey = FediafSpecies;

export function isFediafSpecies(species: Species): species is FediafSpeciesKey {
  return species === "dog" || species === "cat";
}

/** FEDIAF species key for an app species (only dog & cat have FEDIAF tables). */
export function fediafSpecies(species: Species): FediafSpeciesKey {
  return species === "cat" ? "cat" : "dog";
}

// ─── Nutrient norms → app codes ───────────────────────────────────
// Maps a FEDIAF nutrient_code onto the app's per-day nutrient code plus the
// factor that converts the FEDIAF per-1000-kcal unit into the app's unit
// (mg totals for minerals, µg for Se/I/B9/B12, IU for A/D, g for macros/AA/FA).
const FEDIAF_TO_APP: Record<string, { code: string; factor: number }> = {
  protein: { code: "CP", factor: 1 },
  fat: { code: "CFa", factor: 1 },
  // Macrominerals: FEDIAF g/1000 kcal → app mg
  calcium: { code: "Ca", factor: 1000 },
  phosphorus: { code: "P", factor: 1000 },
  magnesium: { code: "Mg", factor: 1000 },
  sodium: { code: "Na", factor: 1000 },
  potassium: { code: "K", factor: 1000 },
  chloride: { code: "Cl", factor: 1000 },
  // Trace: FEDIAF mg → app mg; µg → app µg
  iron: { code: "Fe", factor: 1 },
  copper: { code: "Cu", factor: 1 },
  zinc: { code: "Zn", factor: 1 },
  manganese: { code: "Mn", factor: 1 },
  selenium_dry: { code: "Se", factor: 1 },
  iodine: { code: "J", factor: 1000 }, // mg → µg
  // Vitamins: A/D in IU, E in IU (≈ mg all-rac-α-tocopheryl acetate), B-group mg/µg
  vitamin_a: { code: "A", factor: 1 },
  vitamin_d: { code: "D", factor: 1 },
  vitamin_e: { code: "E", factor: 1 },
  vitamin_b1: { code: "B1", factor: 1 },
  vitamin_b2: { code: "B2", factor: 1 },
  vitamin_b3: { code: "B3", factor: 1 },
  vitamin_b5: { code: "B5", factor: 1 },
  vitamin_b6: { code: "B6", factor: 1 },
  vitamin_b9: { code: "B9", factor: 1 },
  vitamin_b12: { code: "B12", factor: 1 },
  choline: { code: "B4", factor: 1 },
  // Fatty acids: g direct; arachidonic given in mg → app g
  linoleic_acid: { code: "LA", factor: 1 },
  arachidonic_acid: { code: "AA", factor: 0.001 },
  alpha_linolenic_acid: { code: "ALA", factor: 1 },
  epa_dha: { code: "EPA_DHA", factor: 1 }, // combined; app sums EPA + DHA totals
  // Essential amino acids (g direct)
  arginine: { code: "Arg", factor: 1 },
  histidine: { code: "His", factor: 1 },
  isoleucine: { code: "Ile", factor: 1 },
  leucine: { code: "Leu", factor: 1 },
  lysine: { code: "Lys", factor: 1 },
  methionine: { code: "Met", factor: 1 },
  phenylalanine: { code: "Phe", factor: 1 },
  threonine: { code: "Thr", factor: 1 },
  tryptophan: { code: "Trp", factor: 1 },
  valine: { code: "Val", factor: 1 },
  taurine_dry: { code: "Tau", factor: 1 },
};

const STAGE_BY_CODE = new Map<string, FediafStage>(FEDIAF_NUTRIENT_STAGES.map((s) => [s.code, s]));

export function fediafStage(stageCode: string): FediafStage | undefined {
  return STAGE_BY_CODE.get(stageCode);
}

export interface FediafStageOption {
  code: string;
  label: string;
}

/** Selectable FEDIAF nutrient columns for a species, in table order. */
export function fediafStageOptions(species: Species): FediafStageOption[] {
  if (!isFediafSpecies(species)) return [];
  const key = fediafSpecies(species);
  return FEDIAF_NUTRIENT_STAGES.filter((s) => s.species === key).map((s) => ({
    code: s.code,
    label: s.nameRu,
  }));
}

/** Map an app life stage to the most appropriate default FEDIAF nutrient column. */
export function defaultFediafStage(species: Species, lifeStage: LifeStage): string {
  if (!isFediafSpecies(species)) return "";
  if (fediafSpecies(species) === "cat") {
    switch (lifeStage) {
      case "puppy_kitten": return "cat_growth";
      case "gestation":
      case "lactation": return "cat_reproduction";
      default: return "cat_adult_mer75"; // adult & senior — neutered/indoor maintenance
    }
  }
  switch (lifeStage) {
    case "puppy_kitten": return "dog_late_growth";
    case "gestation":
    case "lactation": return "dog_early_growth_reproduction";
    default: return "dog_adult_mer110"; // adult & senior — typical maintenance
  }
}

/**
 * FEDIAF minimums for a stage, keyed by the app's nutrient code and expressed
 * per 1000 kcal ME in the app's own units. Only established minimums that map
 * to an app code are included. `EPA_DHA` is the combined EPA+DHA floor.
 */
export function fediafNormValuesPer1000(stageCode: string): Record<string, number | null> {
  const stage = STAGE_BY_CODE.get(stageCode);
  const out: Record<string, number | null> = {};
  if (!stage) return out;
  for (const n of stage.nutrients) {
    const map = FEDIAF_TO_APP[n.code];
    if (!map) continue;
    out[map.code] = n.established && n.min != null ? n.min * map.factor : null;
  }
  return out;
}

/** Established numeric minimums for existing comparison callers. */
export function fediafNormsPer1000(stageCode: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(fediafNormValuesPer1000(stageCode)).filter(
      (entry): entry is [string, number] => entry[1] != null,
    ),
  );
}

// ─── Energy (MER) formulas ────────────────────────────────────────
const FORMULA_BY_PHASE = new Map<string, FediafEnergyFormula>(
  FEDIAF_ENERGY_FORMULAS.map((f) => [`${f.species}:${f.code}`, f]),
);

export interface FediafEnergyEstimate {
  /** Point estimate kcal ME/day; null when the formula needs data we don't collect. */
  kcal: number | null;
  /** Lower/upper kcal ME/day when FEDIAF gives a coefficient range. */
  low: number | null;
  high: number | null;
  /** The FEDIAF phase the estimate is based on. */
  phase: FediafEnergyFormula;
  /** Extra FEDIAF phases worth showing (e.g. late gestation, high-impact activity). */
  alternates: FediafEnergyFormula[];
  /** Set when the formula requires parameters the calculator does not gather. */
  note: string | null;
}

const exponent = (species: FediafSpeciesKey) => (species === "cat" ? 0.67 : 0.75);

function phase(species: FediafSpeciesKey, code: string): FediafEnergyFormula | undefined {
  return FORMULA_BY_PHASE.get(`${species}:${code}`);
}

/**
 * Estimate FEDIAF daily energy (MER) for the common calculator inputs. Growth,
 * lactation and (for cats) kitten stages need parameters the calculator doesn't
 * collect — those return `kcal: null` with the applicable FEDIAF formula(s) and
 * a note, so the UI can still surface the official formula.
 */
export function estimateFediafMER(
  species: Species,
  lifeStage: LifeStage,
  activity: ActivityLevel,
  neutered: boolean,
  weightKg: number,
): FediafEnergyEstimate | null {
  const key = fediafSpecies(species);
  const exp = exponent(key);
  const bw = weightKg > 0 ? Math.pow(weightKg, exp) : 0;
  const round = (v: number) => Math.round(v);
  const pick = (code: string) => phase(key, code);

  const point = (coef: number, p: FediafEnergyFormula, alternates: FediafEnergyFormula[] = []): FediafEnergyEstimate =>
    ({ kcal: round(coef * bw), low: null, high: null, phase: p, alternates, note: null });
  const ranged = (lo: number, hi: number, p: FediafEnergyFormula, alternates: FediafEnergyFormula[] = []): FediafEnergyEstimate =>
    ({ kcal: round(((lo + hi) / 2) * bw), low: round(lo * bw), high: round(hi * bw), phase: p, alternates, note: null });
  const formulaOnly = (p: FediafEnergyFormula, note: string, alternates: FediafEnergyFormula[] = []): FediafEnergyEstimate =>
    ({ kcal: null, low: null, high: null, phase: p, alternates, note });

  if (key === "dog") {
    if (lifeStage === "adult") {
      if (activity === "low") {
        const p = pick("activity_low"); if (!p) return null;
        return point(90, p, [pick("obesity_prone")].filter(Boolean) as FediafEnergyFormula[]);
      }
      if (activity === "high" || activity === "very_high") {
        const p = pick("activity_high"); if (!p) return null;
        return ranged(150, 175, p);
      }
      // moderate → typical adult maintenance, show the low/high-impact bracket
      const p = pick("activity_moderate_low_impact"); if (!p) return null;
      return point(110, p, [pick("activity_moderate_high_impact")].filter(Boolean) as FediafEnergyFormula[]);
    }
    if (lifeStage === "senior") {
      const p = pick("senior_over_7"); if (!p) return null;
      return ranged(80, 120, p);
    }
    if (lifeStage === "gestation") {
      const p = pick("gestation_first_4w"); if (!p) return null;
      return { ...point(132, p, [pick("gestation_last_5w")].filter(Boolean) as FediafEnergyFormula[]),
        note: "Оценка для первых 4 недель; в последние 5 недель добавляется +26 × масса." };
    }
    if (lifeStage === "puppy_kitten") {
      const p = pick("puppy_8w_1y"); if (!p) return null;
      return formulaOnly(p, "Нужна ожидаемая взрослая масса: MER = [254.1 − 135 × (масса / взрослая масса)] × масса^0.75. Сверяйте с кривой роста и BCS.");
    }
    if (lifeStage === "lactation") {
      const p = pick("lactation_1_4"); if (!p) return null;
      return formulaOnly(p, "Зависит от числа щенков и недели лактации — добавьте лактационную надбавку по формуле FEDIAF.");
    }
    return null;
  }

  // cat
  if (lifeStage === "adult" || lifeStage === "senior") {
    if (neutered && (activity === "low" || activity === "moderate")) {
      const p = pick("adult_indoor_neutered"); if (!p) return null;
      return ranged(52, 75, p, [pick("adult_active")].filter(Boolean) as FediafEnergyFormula[]);
    }
    const p = pick("adult_active"); if (!p) return null;
    return point(100, p, [pick("adult_indoor_neutered")].filter(Boolean) as FediafEnergyFormula[]);
  }
  if (lifeStage === "gestation") {
    const p = pick("gestation"); if (!p) return null;
    return point(140, p, [pick("lactation_3_4")].filter(Boolean) as FediafEnergyFormula[]);
  }
  if (lifeStage === "puppy_kitten") {
    const p = pick("kitten_0_4m"); if (!p) return null;
    return formulaOnly(p, "Котятам энергия задаётся как кратное MER взрослой кошки (×2.5 до 4 мес., ×1.75–2.0 в 4–9 мес., ×1.5 в 9–12 мес.).");
  }
  if (lifeStage === "lactation") {
    const p = pick("lactation_3_4"); if (!p) return null;
    return formulaOnly(p, "Зависит от числа котят и недели лактации — добавьте лактационную надбавку по формуле FEDIAF.");
  }
  return null;
}

// ─── Confirmed clinical workflow ───────────────────────────────
const SIZE_CLASS_BY_CODE = new Map<string, FediafSizeClass>(
  FEDIAF_SIZE_CLASSES.map((sizeClass) => [sizeClass.code, sizeClass]),
);

export interface FediafAnimalProfile {
  species: Species;
  breedCode: string;
  currentBodyWeightKg: number | null;
  expectedAdultWeightKg: number | null;
  ageWeeks: number | null;
  ageMonths: number | null;
  lifeStage: LifeStage;
  activity: ActivityLevel;
  neutered: boolean;
  pregnant: boolean;
  lactating: boolean;
  lactationWeek: number | null;
  litterSize: number | null;
  maintenanceEnergyKcalDay: number | null;
}

export type FediafSuggestionConfidence = "high" | "low";

export interface FediafSelectionSuggestion {
  stageCode: string | null;
  formulaCode: string | null;
  sizeClassCode: string | null;
  confidence: FediafSuggestionConfidence;
  reasonsRu: string[];
  unresolvedSizeClass: boolean;
}

export interface FediafConfirmedEnergyEstimate {
  kcal: number | null;
  low: number | null;
  high: number | null;
  phase: FediafEnergyFormula;
  missingParameters: string[];
  validationMessagesRu: string[];
}

export interface FediafFormulaOption {
  code: string;
  label: string;
}

export function fediafEnergyFormula(species: Species, code: string): FediafEnergyFormula | undefined {
  return isFediafSpecies(species) ? FORMULA_BY_PHASE.get(`${species}:${code}`) : undefined;
}

export function fediafEnergyFormulaOptions(species: Species): FediafFormulaOption[] {
  if (!isFediafSpecies(species)) return [];
  return FEDIAF_ENERGY_FORMULAS.filter((formula) => formula.species === species).map((formula) => ({
    code: formula.code,
    label: formula.nameRu,
  }));
}

export function fediafSizeClass(code: string): FediafSizeClass | undefined {
  return SIZE_CLASS_BY_CODE.get(code);
}

function passesSizeConstraint(value: number, constraint: FediafSizeClass["expectedAdultWeightKg"]): boolean {
  if (constraint.min != null && value < constraint.min) return false;
  if (constraint.min_exclusive === true && constraint.min != null && value <= constraint.min) return false;
  if (typeof constraint.min_exclusive === "number" && value <= constraint.min_exclusive) return false;
  if (constraint.max != null && value > constraint.max) return false;
  if (constraint.max_exclusive === true && constraint.max != null && value >= constraint.max) return false;
  if (typeof constraint.max_exclusive === "number" && value >= constraint.max_exclusive) return false;
  return true;
}

export function mapDogSizeClass(
  expectedAdultWeightKg: number | null,
  currentBodyWeightKg: number | null,
  lifeStage: LifeStage,
): { code: string | null; confidence: FediafSuggestionConfidence; reasonRu: string } {
  const expected = expectedAdultWeightKg != null && expectedAdultWeightKg > 0 ? expectedAdultWeightKg : null;
  const adultProxy = lifeStage !== "puppy_kitten" && currentBodyWeightKg != null && currentBodyWeightKg > 0
    ? currentBodyWeightKg
    : null;
  const value = expected ?? adultProxy;
  if (value == null) {
    return {
      code: null,
      confidence: "low",
      reasonRu: lifeStage === "puppy_kitten"
        ? "Укажите ожидаемую взрослую массу; текущую массу щенка нельзя выдавать за взрослый размер."
        : "Укажите текущую или ожидаемую взрослую массу, чтобы определить класс размера.",
    };
  }
  const match = FEDIAF_SIZE_CLASSES.find((sizeClass) => passesSizeConstraint(value, sizeClass.expectedAdultWeightKg));
  return {
    code: match?.code ?? null,
    confidence: expected ? "high" : "low",
    reasonRu: expected
      ? "Класс определён по ожидаемой взрослой массе."
      : "Класс предварительно определён по текущей массе взрослой собаки; проверьте ожидаемую взрослую массу.",
  };
}

export function suggestFediafSelection(profile: FediafAnimalProfile): FediafSelectionSuggestion {
  if (!isFediafSpecies(profile.species)) {
    return {
      stageCode: null,
      formulaCode: null,
      sizeClassCode: null,
      confidence: "low",
      reasonsRu: ["FEDIAF 2025 в этой базе применяется только к собакам и кошкам."],
      unresolvedSizeClass: false,
    };
  }

  let stageCode = defaultFediafStage(profile.species, profile.lifeStage);
  let formulaCode: string;
  let confidence: FediafSuggestionConfidence = "high";
  const reasonsRu: string[] = [];

  if (profile.species === "dog") {
    if (profile.lifeStage === "puppy_kitten") {
      stageCode = profile.ageWeeks != null && profile.ageWeeks < 14
        ? "dog_early_growth_reproduction"
        : "dog_late_growth";
      formulaCode = "puppy_8w_1y";
      if (profile.ageWeeks == null) {
        confidence = "low";
        reasonsRu.push("Возраст не указан: выбран поздний рост, проверьте границу 14 недель.");
      }
    } else if (profile.lifeStage === "gestation" || profile.pregnant) {
      stageCode = "dog_early_growth_reproduction";
      formulaCode = "gestation_first_4w";
      confidence = "low";
      reasonsRu.push("Неделя беременности не хранится в профиле: проверьте раннюю/позднюю формулу.");
    } else if (profile.lifeStage === "lactation" || profile.lactating) {
      stageCode = "dog_early_growth_reproduction";
      formulaCode = profile.litterSize != null && profile.litterSize >= 5 ? "lactation_5_8" : "lactation_1_4";
      if (profile.litterSize == null) {
        confidence = "low";
        reasonsRu.push("Размер помёта не указан: формула лактации требует проверки.");
      }
    } else if (profile.lifeStage === "senior") {
      stageCode = "dog_adult_mer95";
      formulaCode = "senior_over_7";
    } else if (profile.activity === "low") {
      stageCode = "dog_adult_mer95";
      formulaCode = "activity_low";
    } else if (profile.activity === "high" || profile.activity === "very_high") {
      stageCode = "dog_adult_mer110";
      formulaCode = "activity_high";
    } else {
      stageCode = "dog_adult_mer110";
      formulaCode = "activity_moderate_low_impact";
    }

    const size = mapDogSizeClass(
      profile.expectedAdultWeightKg,
      profile.currentBodyWeightKg,
      profile.lifeStage,
    );
    if (size.confidence === "low") confidence = "low";
    reasonsRu.push(size.reasonRu);
    return {
      stageCode,
      formulaCode,
      sizeClassCode: size.code,
      confidence,
      reasonsRu,
      unresolvedSizeClass: size.code == null,
    };
  }

  if (profile.lifeStage === "puppy_kitten") {
    stageCode = "cat_growth";
    if (profile.ageMonths == null) {
      formulaCode = "kitten_0_4m";
      confidence = "low";
      reasonsRu.push("Возраст не указан: проверьте возрастной диапазон формулы котёнка.");
    } else if (profile.ageMonths < 4) formulaCode = "kitten_0_4m";
    else if (profile.ageMonths < 9) formulaCode = "kitten_4_9m";
    else formulaCode = "kitten_9_12m";
  } else if (profile.lifeStage === "gestation" || profile.pregnant) {
    stageCode = "cat_reproduction";
    formulaCode = "gestation";
  } else if (profile.lifeStage === "lactation" || profile.lactating) {
    stageCode = "cat_reproduction";
    if (profile.litterSize == null) {
      formulaCode = "lactation_3_4";
      confidence = "low";
      reasonsRu.push("Размер помёта не указан: выберите диапазон после уточнения.");
    } else if (profile.litterSize < 3) formulaCode = "lactation_lt3";
    else if (profile.litterSize <= 4) formulaCode = "lactation_3_4";
    else formulaCode = "lactation_gt4";
  } else if (profile.neutered || profile.activity === "low") {
    stageCode = "cat_adult_mer75";
    formulaCode = "adult_indoor_neutered";
  } else {
    stageCode = "cat_adult_mer100";
    formulaCode = "adult_active";
  }
  return { stageCode, formulaCode, sizeClassCode: null, confidence, reasonsRu, unresolvedSizeClass: false };
}

export function deriveFediafAge(birthDate: string | Date, now = new Date()): { ageWeeks: number; ageMonths: number } | null {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime()) || birth > now) return null;
  const days = Math.floor((now.getTime() - birth.getTime()) / 86_400_000);
  return { ageWeeks: Math.floor(days / 7), ageMonths: Math.floor(days / 30.4375) };
}

const roundKcal = (value: number) => Math.round(value);
const dogBw = (weight: number) => Math.pow(weight, 0.75);
const catBw = (weight: number) => Math.pow(weight, 0.67);

function missingLabel(parameter: string): string {
  const labels: Record<string, string> = {
    body_weight_kg: "масса тела",
    expected_adult_weight_kg: "ожидаемая взрослая масса",
    litter_size: "размер помёта",
    lactation_week: "неделя лактации",
    maintenance_energy_kcal_day: "базовая MER взрослой кошки",
  };
  return labels[parameter] ?? parameter;
}

/** Evaluate a clinician-confirmed generated formula without executing database expressions. */
export function calculateFediafMER(
  species: Species,
  formulaCode: string,
  profile: FediafAnimalProfile,
): FediafConfirmedEnergyEstimate | null {
  const formula = isFediafSpecies(species) ? FORMULA_BY_PHASE.get(`${species}:${formulaCode}`) : undefined;
  if (!formula || !isFediafSpecies(species)) return null;

  const weight = profile.currentBodyWeightKg != null && profile.currentBodyWeightKg > 0
    ? profile.currentBodyWeightKg
    : null;
  const expectedWeight = profile.expectedAdultWeightKg != null && profile.expectedAdultWeightKg > 0
    ? profile.expectedAdultWeightKg
    : null;
  const litterSize = profile.litterSize != null && profile.litterSize > 0 ? profile.litterSize : null;
  const lactationWeek = profile.lactationWeek != null && profile.lactationWeek > 0 ? profile.lactationWeek : null;
  const maintenance = profile.maintenanceEnergyKcalDay != null && profile.maintenanceEnergyKcalDay > 0
    ? profile.maintenanceEnergyKcalDay
    : null;
  const missingParameters: string[] = [];
  const validationMessagesRu: string[] = [];

  if (formula.parameters.some((parameter) => parameter === "body_weight_kg" || parameter === "body_weight_g") && weight == null) {
    missingParameters.push("body_weight_kg");
  }
  if (formula.parameters.includes("expected_adult_weight_kg") && expectedWeight == null) missingParameters.push("expected_adult_weight_kg");
  if ((formula.parameters.includes("litter_size") || formula.constraints?.litter_size) && litterSize == null) {
    missingParameters.push("litter_size");
  }
  if (formula.parameters.includes("lactation_factor") && lactationWeek == null) missingParameters.push("lactation_week");
  if (formula.parameters.includes("maintenance_energy_kcal_day") && maintenance == null) missingParameters.push("maintenance_energy_kcal_day");
  if (missingParameters.length > 0) {
    validationMessagesRu.push(`Не хватает данных: ${missingParameters.map(missingLabel).join(", ")}.`);
    return { kcal: null, low: null, high: null, phase: formula, missingParameters, validationMessagesRu };
  }

  const constraint = formula.constraints?.litter_size;
  if (constraint && litterSize != null) {
    if (constraint.min != null && litterSize < constraint.min) validationMessagesRu.push(`Размер помёта должен быть не меньше ${constraint.min}.`);
    if (constraint.max != null && litterSize > constraint.max) validationMessagesRu.push(`Размер помёта должен быть не больше ${constraint.max}.`);
    if (typeof constraint.min_exclusive === "number" && litterSize <= constraint.min_exclusive) validationMessagesRu.push(`Размер помёта должен быть больше ${constraint.min_exclusive}.`);
    if (typeof constraint.max_exclusive === "number" && litterSize >= constraint.max_exclusive) validationMessagesRu.push(`Размер помёта должен быть меньше ${constraint.max_exclusive}.`);
  }
  const lactationFactor = lactationWeek != null
    ? FEDIAF_LACTATION_RULES[species].weekFactors[String(lactationWeek)]
    : undefined;
  if (formula.parameters.includes("lactation_factor") && lactationFactor == null) {
    validationMessagesRu.push(`Для недели ${lactationWeek} в базе нет коэффициента лактации.`);
  }
  if (formulaCode === "puppy_8w_1y" && expectedWeight != null && weight != null && expectedWeight <= weight) {
    validationMessagesRu.push("Ожидаемая взрослая масса щенка должна быть больше текущей массы.");
  }
  if (validationMessagesRu.length > 0) {
    return { kcal: null, low: null, high: null, phase: formula, missingParameters, validationMessagesRu };
  }

  let kcal: number | null = null;
  let low: number | null = null;
  let high: number | null = null;
  const bw = weight ?? 0;
  const dogPower = dogBw(bw);
  const catPower = catBw(bw);

  switch (`${species}:${formulaCode}`) {
    case "dog:adult_age_1_2": kcal = 130 * dogPower; low = 125 * dogPower; high = 140 * dogPower; break;
    case "dog:adult_age_3_7": kcal = 110 * dogPower; low = 95 * dogPower; high = 130 * dogPower; break;
    case "dog:senior_over_7": kcal = 95 * dogPower; low = 80 * dogPower; high = 120 * dogPower; break;
    case "dog:activity_low": kcal = 95 * dogPower; break;
    case "dog:activity_moderate_low_impact": kcal = 110 * dogPower; break;
    case "dog:activity_moderate_high_impact": kcal = 125 * dogPower; break;
    case "dog:activity_high": low = 150 * dogPower; high = 175 * dogPower; kcal = (low + high) / 2; break;
    case "dog:obesity_prone": high = 90 * dogPower; kcal = high; break;
    case "dog:newborn": kcal = 25 * ((bw * 1000) / 100); break;
    case "dog:puppy_8w_1y": kcal = (254.1 - 135 * (bw / (expectedWeight ?? 1))) * dogPower; break;
    case "dog:gestation_first_4w": kcal = 132 * dogPower; break;
    case "dog:gestation_last_5w": kcal = 132 * dogPower + 26 * bw; break;
    case "dog:lactation_1_4": kcal = 145 * dogPower + 24 * (litterSize ?? 0) * bw * (lactationFactor ?? 0); break;
    case "dog:lactation_5_8": kcal = 145 * dogPower + (96 + 12 * ((litterSize ?? 0) - 4)) * bw * (lactationFactor ?? 0); break;
    case "cat:adult_indoor_neutered": low = 52 * catPower; high = 75 * catPower; kcal = (low + high) / 2; break;
    case "cat:adult_active": kcal = 100 * catPower; break;
    case "cat:kitten_0_4m": low = 2 * (maintenance ?? 0); high = 2.5 * (maintenance ?? 0); kcal = (low + high) / 2; break;
    case "cat:kitten_4_9m": low = 1.75 * (maintenance ?? 0); high = 2 * (maintenance ?? 0); kcal = (low + high) / 2; break;
    case "cat:kitten_9_12m": kcal = 1.5 * (maintenance ?? 0); break;
    case "cat:gestation": kcal = 140 * catPower; break;
    case "cat:lactation_lt3": kcal = 100 * catPower + 18 * bw * (lactationFactor ?? 0); break;
    case "cat:lactation_3_4": kcal = 100 * catPower + 60 * bw * (lactationFactor ?? 0); break;
    case "cat:lactation_gt4": kcal = 100 * catPower + 70 * bw * (lactationFactor ?? 0); break;
  }
  return {
    kcal: kcal != null && Number.isFinite(kcal) && kcal > 0 ? roundKcal(kcal) : null,
    low: low != null ? roundKcal(low) : null,
    high: high != null ? roundKcal(high) : null,
    phase: formula,
    missingParameters,
    validationMessagesRu,
  };
}
