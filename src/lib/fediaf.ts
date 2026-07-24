// Typed access layer over the generated FEDIAF 2025 dataset (fediaf-data.ts).
//
// Two things the Nutritionist Assistant consumes:
//  1. Nutrient minimums per 1000 kcal ME, remapped onto the app's own nutrient
//     codes/units so the diet analysis can compare a ration against FEDIAF just
//     like it does against NRC 2006 (see nutrition-analysis.ts).
//  2. Daily-energy (MER) formulas, evaluated for the common life stages so the
//     RER/MER calculator can show a FEDIAF estimate next to the RER × factor one.
//
// Reference floors are informational — clinical decisions must be checked
// against the current FEDIAF/NRC tables.

import type { LifeStage, ActivityLevel, Species } from "./types";
import {
  FEDIAF_NUTRIENT_STAGES, FEDIAF_ENERGY_FORMULAS,
  type FediafStage, type FediafSpecies, type FediafEnergyFormula,
} from "./fediaf-data";

export type FediafSpeciesKey = FediafSpecies;

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
  const key = fediafSpecies(species);
  return FEDIAF_NUTRIENT_STAGES.filter((s) => s.species === key).map((s) => ({
    code: s.code,
    label: s.labelRu,
  }));
}

/** Map an app life stage to the most appropriate default FEDIAF nutrient column. */
export function defaultFediafStage(species: Species, lifeStage: LifeStage): string {
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
export function fediafNormsPer1000(stageCode: string): Record<string, number> {
  const stage = STAGE_BY_CODE.get(stageCode);
  const out: Record<string, number> = {};
  if (!stage) return out;
  for (const n of stage.nutrients) {
    if (!n.established || n.min == null) continue;
    const map = FEDIAF_TO_APP[n.code];
    if (!map) continue;
    out[map.code] = n.min * map.factor;
  }
  return out;
}

// ─── Energy (MER) formulas ────────────────────────────────────────
const FORMULA_BY_PHASE = new Map<string, FediafEnergyFormula>(
  FEDIAF_ENERGY_FORMULAS.map((f) => [`${f.species}:${f.phaseCode}`, f]),
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
