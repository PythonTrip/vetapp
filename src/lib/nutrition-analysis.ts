// Diet nutrient analysis: aggregates per-day micro/macronutrient totals for a
// built ration from linked catalog products and compares them against FEDIAF
// 2025 reference norms per 1000 kcal ME (life-stage aware, see fediaf.ts).
// Reference values are informational — clinical decisions must be checked
// against the current FEDIAF tables.

import type { BuiltDietComponent } from "./nutrition";
import type { DietComponentCategory, DietTemplateComponent } from "./types";
import type { NutritionProductDto } from "./nutrition-products";
import { fediafNormsPer1000 } from "./fediaf";

export type NutrientGroupId = "minerals" | "trace" | "vitamins" | "amino" | "fatty";

export interface NutrientDaySpec {
  code: string;
  label: string;
  group: NutrientGroupId;
  /** Unit of both the per-100 g catalog value and the aggregated per-day total */
  unit: "мг" | "мкг" | "г" | "МЕ";
}

// Codes aggregated into per-day totals. Vitamins A/D keep the catalog's МЕ unit
// and are shown as totals only (no norm comparison).
export const NUTRIENT_DAY_SPECS: NutrientDaySpec[] = [
  { code: "Ca", label: "Кальций", group: "minerals", unit: "мг" },
  { code: "P", label: "Фосфор", group: "minerals", unit: "мг" },
  { code: "Mg", label: "Магний", group: "minerals", unit: "мг" },
  { code: "Na", label: "Натрий", group: "minerals", unit: "мг" },
  { code: "K", label: "Калий", group: "minerals", unit: "мг" },
  { code: "Cl", label: "Хлор", group: "minerals", unit: "мг" },
  { code: "Fe", label: "Железо", group: "trace", unit: "мг" },
  { code: "Cu", label: "Медь", group: "trace", unit: "мг" },
  { code: "Zn", label: "Цинк", group: "trace", unit: "мг" },
  { code: "Mn", label: "Марганец", group: "trace", unit: "мг" },
  { code: "Se", label: "Селен", group: "trace", unit: "мкг" },
  { code: "J", label: "Йод", group: "trace", unit: "мкг" },
  { code: "A", label: "Витамин A", group: "vitamins", unit: "МЕ" },
  { code: "D", label: "Витамин D", group: "vitamins", unit: "МЕ" },
  { code: "E", label: "Витамин E", group: "vitamins", unit: "мг" },
  { code: "C", label: "Витамин C", group: "vitamins", unit: "мг" },
  { code: "B1", label: "B1 (тиамин)", group: "vitamins", unit: "мг" },
  { code: "B2", label: "B2 (рибофлавин)", group: "vitamins", unit: "мг" },
  { code: "B3", label: "B3 (ниацин)", group: "vitamins", unit: "мг" },
  { code: "B4", label: "B4 (холин)", group: "vitamins", unit: "мг" },
  { code: "B5", label: "B5 (пантотенат)", group: "vitamins", unit: "мг" },
  { code: "B6", label: "B6 (пиридоксин)", group: "vitamins", unit: "мг" },
  { code: "B9", label: "B9 (фолат)", group: "vitamins", unit: "мкг" },
  { code: "B12", label: "B12", group: "vitamins", unit: "мкг" },
  { code: "Tau", label: "Таурин", group: "amino", unit: "г" },
  { code: "Arg", label: "Аргинин", group: "amino", unit: "г" },
  { code: "His", label: "Гистидин", group: "amino", unit: "г" },
  { code: "Ile", label: "Изолейцин", group: "amino", unit: "г" },
  { code: "Leu", label: "Лейцин", group: "amino", unit: "г" },
  { code: "Lys", label: "Лизин", group: "amino", unit: "г" },
  { code: "Met", label: "Метионин", group: "amino", unit: "г" },
  { code: "Phe", label: "Фенилаланин", group: "amino", unit: "г" },
  { code: "Thr", label: "Треонин", group: "amino", unit: "г" },
  { code: "Trp", label: "Триптофан", group: "amino", unit: "г" },
  { code: "Val", label: "Валин", group: "amino", unit: "г" },
  { code: "LA", label: "Линолевая (ω6)", group: "fatty", unit: "г" },
  { code: "AA", label: "Арахидоновая (ω6)", group: "fatty", unit: "г" },
  { code: "ALA", label: "α-линоленовая (ω3)", group: "fatty", unit: "г" },
  { code: "EPA", label: "EPA (ω3)", group: "fatty", unit: "г" },
  { code: "DHA", label: "DHA (ω3)", group: "fatty", unit: "г" },
];

export const NUTRIENT_GROUP_LABELS: Record<NutrientGroupId, string> = {
  minerals: "Макроминералы",
  trace: "Микроэлементы",
  vitamins: "Витамины",
  amino: "Аминокислоты",
  fatty: "Жирные кислоты",
};

export interface DietNutrientAnalysis {
  /** Per-day totals keyed by nutrient code, in NUTRIENT_DAY_SPECS units */
  totals: Record<string, number>;
  /** Protein / fat / carbs / fiber grams per day across covered mass */
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  /** Energy split of the covered mass (modified Atwater), kcal/day */
  proteinKcal: number;
  fatKcal: number;
  carbsKcal: number;
  /** Share of ration mass contributed by components with full catalog data (0..1) */
  coverage: number;
  coveredGrams: number;
  totalGrams: number;
  caPRatio: number | null;
  omega6to3: number | null;
}

/**
 * Aggregate per-day nutrient totals for the built ration. Only components linked
 * to catalog products contribute; `coverage` reports the analysed mass share.
 */
export function aggregateDietNutrients(
  built: BuiltDietComponent[],
  productsById: Map<number, NutritionProductDto>
): DietNutrientAnalysis {
  const totals: Record<string, number> = {};
  let proteinG = 0;
  let fatG = 0;
  let carbsG = 0;
  let fiberG = 0;
  let coveredGrams = 0;
  const totalGrams = built.reduce((sum, c) => sum + c.grams, 0);

  for (const component of built) {
    const product = component.productId != null ? productsById.get(component.productId) : undefined;
    if (!product || component.grams <= 0) continue;
    coveredGrams += component.grams;
    const per100 = component.grams / 100;
    const nutrientMap = new Map(product.nutrients.map((n) => [n.code, n.value]));

    proteinG += (nutrientMap.get("CP") ?? 0) * per100;
    fatG += (nutrientMap.get("CFa") ?? 0) * per100;
    carbsG += (nutrientMap.get("CH") ?? 0) * per100;
    fiberG += (nutrientMap.get("CFi") ?? 0) * per100;

    for (const spec of NUTRIENT_DAY_SPECS) {
      const value = nutrientMap.get(spec.code);
      if (value == null) continue;
      totals[spec.code] = (totals[spec.code] ?? 0) + value * per100;
    }
  }

  const omega6 = (totals["LA"] ?? 0) + (totals["AA"] ?? 0);
  const omega3 = (totals["ALA"] ?? 0) + (totals["EPA"] ?? 0) + (totals["DHA"] ?? 0);

  return {
    totals,
    proteinG,
    fatG,
    carbsG,
    fiberG,
    proteinKcal: proteinG * 3.5,
    fatKcal: fatG * 8.5,
    carbsKcal: carbsG * 3.5,
    coverage: totalGrams > 0 ? coveredGrams / totalGrams : 0,
    coveredGrams,
    totalGrams,
    caPRatio: totals["P"] ? (totals["Ca"] ?? 0) / totals["P"] : null,
    omega6to3: omega3 > 0 ? omega6 / omega3 : null,
  };
}

export interface NormComparisonRow {
  code: string;
  label: string;
  unit: string;
  value: number;
  norm: number;
  pct: number; // value / norm × 100
}

/**
 * Resolve the FEDIAF per-1000-kcal norm table (in app units) for the
 * clinician-confirmed life stage.
 */
export function resolveNorms(fediafStageCode: string): Record<string, number> {
  return fediafNormsPer1000(fediafStageCode);
}

/**
 * Compare per-day totals against a per-1000-kcal norm table scaled to the
 * ration's kcal. Returns only nutrients that have both a norm and catalog data.
 * `norms` comes from {@link resolveNorms}; keys are the app's nutrient codes.
 */
export function buildNormComparison(
  analysis: DietNutrientAnalysis,
  rationKcal: number,
  norms: Record<string, number>
): NormComparisonRow[] {
  const factor = rationKcal / 1000;
  if (factor <= 0) return [];

  const rows: NormComparisonRow[] = [];
  const push = (code: string, label: string, unit: string, value: number | undefined) => {
    const normPer1000 = norms[code];
    if (normPer1000 == null || value == null) return;
    const norm = normPer1000 * factor;
    rows.push({ code, label, unit, value, norm, pct: norm > 0 ? (value / norm) * 100 : 0 });
  };

  push("CP", "Белок", "г", analysis.proteinG > 0 ? analysis.proteinG : undefined);
  push("CFa", "Жир", "г", analysis.fatG > 0 ? analysis.fatG : undefined);
  for (const spec of NUTRIENT_DAY_SPECS) {
    push(spec.code, spec.label, spec.unit, analysis.totals[spec.code]);
  }
  // Combined EPA + DHA floor (FEDIAF ω-3 minimum is given for the pair).
  const epaDha = (analysis.totals["EPA"] ?? 0) + (analysis.totals["DHA"] ?? 0);
  push("EPA_DHA", "ЭПК+ДГК (ω3)", "г", epaDha > 0 ? epaDha : undefined);
  return rows;
}

// ─── Catalog → Diet Builder mapping ───────────────────────────────
export const CATALOG_TO_DIET_CATEGORY: Record<string, DietComponentCategory> = {
  "белки": "protein",
  "углеводы": "grain",
  "жиры": "fat",
  "клетчатка": "vegetable",
  "сухие корма": "commercial",
  "влажные корма": "commercial",
  "добавки": "supplement",
  "лакомства": "supplement",
};

/** Build a Diet Builder component from a catalog product. */
export function productToDietComponent(product: NutritionProductDto): DietTemplateComponent {
  const nutrientMap = new Map(product.nutrients.map((n) => [n.code, n.value]));
  return {
    category: CATALOG_TO_DIET_CATEGORY[product.category] ?? "protein",
    ingredient: product.name,
    grams: 0,
    productId: product.id,
    meKcalPerKg: nutrientMap.get("ME") ?? null,
    proteinPct: nutrientMap.get("CP") ?? null,
    fatPct: nutrientMap.get("CFa") ?? null,
  };
}

/** Format a per-day nutrient value for display. */
export function formatNutrientValue(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
}
