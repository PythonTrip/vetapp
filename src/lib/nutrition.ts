// Veterinary nutrition calculation utilities
// Based on standard veterinary nutrition formulas (WSAVA, AAHA, NRC)

import type {
  LifeStage, ActivityLevel, Species, RERMERResult, DryMatterResult, DietTemplateComponent,
} from "./types";

/**
 * Resting Energy Requirement (RER)
 * RER = 70 * (body weight in kg)^0.75
 * Standard allometric formula accepted by NRC/AAHA.
 */
export function calculateRER(weightKg: number): number {
  if (weightKg <= 0) return 0;
  return Math.round(70 * Math.pow(weightKg, 0.75));
}

/**
 * Get MER factors (multipliers of RER) based on species, life stage, activity.
 * Returns an array of applicable factors with labels so the UI can show context.
 */
export function getMERFactors(
  species: Species,
  lifeStage: LifeStage,
  activity: ActivityLevel,
  neutered: boolean
): { label: string; value: number }[] {
  const factors: { label: string; value: number }[] = [];

  if (species === "dog") {
    // Canine MER factors (AAHA 2014 / NRC 2006)
    if (lifeStage === "puppy_kitten") {
      factors.push({ label: "Puppy (< 4 months)", value: 3.0 });
      factors.push({ label: "Puppy (4-12 months)", value: 2.0 });
    } else if (lifeStage === "adult") {
      if (neutered) {
        factors.push({ label: "Adult neutered", value: 1.6 });
      } else {
        factors.push({ label: "Adult intact", value: 1.8 });
      }
      // Activity modifiers
      if (activity === "low") factors.push({ label: "Low activity", value: 1.4 });
      if (activity === "moderate") factors.push({ label: "Moderate activity", value: 1.6 });
      if (activity === "high") factors.push({ label: "High activity / working", value: 2.0 });
      if (activity === "very_high") factors.push({ label: "Very high (endurance)", value: 3.0 });
    } else if (lifeStage === "senior") {
      factors.push({ label: "Senior dog", value: 1.4 });
    } else if (lifeStage === "gestation") {
      factors.push({ label: "Gestation (early)", value: 1.8 });
      factors.push({ label: "Gestation (late)", value: 3.0 });
    } else if (lifeStage === "lactation") {
      factors.push({ label: "Lactation", value: 4.5 });
    }
  } else if (species === "cat") {
    // Feline MER factors
    if (lifeStage === "puppy_kitten") {
      factors.push({ label: "Kitten (< 1 year)", value: 2.5 });
    } else if (lifeStage === "adult") {
      if (neutered) {
        factors.push({ label: "Adult neutered", value: 1.2 });
      } else {
        factors.push({ label: "Adult intact", value: 1.4 });
      }
      if (activity === "low") factors.push({ label: "Weight loss", value: 0.8 });
      if (activity === "moderate") factors.push({ label: "Lean / prone to obesity", value: 1.0 });
    } else if (lifeStage === "senior") {
      factors.push({ label: "Senior cat", value: 1.1 });
    } else if (lifeStage === "gestation") {
      factors.push({ label: "Gestation", value: 2.0 });
    } else if (lifeStage === "lactation") {
      factors.push({ label: "Lactation (peak)", value: 2.5 });
    }
  } else {
    // Generic mammalian maintenance factors for other species. RER (70·BW^0.75)
    // holds across mammals; MER multipliers here are conservative estimates —
    // exotic-species energy needs should be confirmed against species references.
    if (lifeStage === "puppy_kitten") {
      factors.push({ label: "Growth (young)", value: 2.0 });
    } else if (lifeStage === "adult") {
      factors.push({ label: neutered ? "Adult neutered" : "Adult intact", value: neutered ? 1.4 : 1.6 });
      if (activity === "low") factors.push({ label: "Low activity", value: 1.2 });
      if (activity === "high") factors.push({ label: "High activity", value: 1.8 });
      if (activity === "very_high") factors.push({ label: "Very high activity", value: 2.2 });
    } else if (lifeStage === "senior") {
      factors.push({ label: "Senior", value: 1.3 });
    } else if (lifeStage === "gestation") {
      factors.push({ label: "Gestation", value: 2.0 });
    } else if (lifeStage === "lactation") {
      factors.push({ label: "Lactation", value: 3.0 });
    }
  }

  return factors;
}

/**
 * Full RER/MER calculation with recommendations.
 */
export function calculateRERMER(
  weightKg: number,
  species: Species,
  lifeStage: LifeStage,
  activity: ActivityLevel,
  neutered: boolean,
  bcs: number,
  targetWeight?: number | null
): RERMERResult {
  const rer = calculateRER(weightKg);
  const factors = getMERFactors(species, lifeStage, activity, neutered);
  // Use the most relevant factor: for adult with activity, prefer activity-based; otherwise first
  const chosenFactor = factors[factors.length - 1]?.value ?? 1.6;
  const mer = Math.round(rer * chosenFactor);

  // Weight status from BCS (1-9 scale)
  let weightStatus: RERMERResult["weightStatus"] = "ideal";
  if (bcs <= 3) weightStatus = "underweight";
  else if (bcs <= 5) weightStatus = "ideal";
  else if (bcs <= 6) weightStatus = "overweight";
  else weightStatus = "obese";

  const recommendations: string[] = [];
  if (weightStatus === "overweight" || weightStatus === "obese") {
    const targetW = targetWeight ?? weightKg * 0.85;
    const targetRER = calculateRER(targetW);
    recommendations.push(
      `For weight loss, feed at ${targetW.toFixed(1)} kg ideal weight: RER × 0.8 ≈ ${Math.round(targetRER * 0.8)} kcal/day.`
    );
    recommendations.push("Recheck weight every 2 weeks; adjust intake if losing <1-2% body weight/week.");
  } else if (weightStatus === "underweight") {
    recommendations.push("Feed 1.2-1.5× MER until target BCS (4-5/9) is reached.");
    recommendations.push("Rule out underlying disease (endocrine, GI malabsorption) if no weight gain in 4 weeks.");
  } else {
    recommendations.push("Weight is ideal. Monitor every 3-6 months and adjust MER to maintain BCS 4-5/9.");
  }

  if (species === "cat" && weightStatus !== "ideal") {
    recommendations.push("⚠️ Cats: restrict weight loss to 0.5-2% per week to prevent hepatic lipidosis.");
  }

  return {
    rer,
    mer,
    merFactors: factors,
    targetWeight: targetWeight ?? null,
    weightStatus,
    recommendations,
  };
}

/**
 * Guaranteed Analysis → Dry Matter converter.
 * As-fed percentages on pet food labels → Dry Matter basis for fair comparison.
 *
 * DM% = (as-fed %) / (100 - moisture %) × 100
 */
export function convertToDryMatter(
  proteinAsFed: number,
  fatAsFed: number,
  fiberAsFed: number,
  moisture: number
): DryMatterResult {
  const dryMatterPct = 100 - moisture;
  const dm = (asFed: number) => (dryMatterPct > 0 ? (asFed / dryMatterPct) * 100 : 0);
  const proteinDM = dm(proteinAsFed);
  const fatDM = dm(fatAsFed);
  const fiberDM = dm(fiberAsFed);
  // NFE (carbohydrates) by difference on DM basis
  const ash = 2.5; // typical ash assumption if unknown
  const carbsDM = Math.max(0, 100 - proteinDM - fatDM - fiberDM - ash);

  return {
    proteinDM: Math.round(proteinDM * 10) / 10,
    fatDM: Math.round(fatDM * 10) / 10,
    fiberDM: Math.round(fiberDM * 10) / 10,
    moisture: Math.round(moisture * 10) / 10,
    dryMatterPct: Math.round(dryMatterPct * 10) / 10,
    carbsDM: Math.round(carbsDM * 10) / 10,
  };
}

/**
 * Estimate metabolizable energy (ME) from macronutrients on DM basis.
 * Modified Atwater factors: 3.5 kcal/g protein, 8.5 kcal/g fat, 3.5 kcal/g carb.
 */
export function estimateMEKcal(
  proteinDM: number,
  fatDM: number,
  carbsDM: number,
  dryMatterPct: number
): number {
  // Per 100g dry matter
  const kcalPer100gDM =
    proteinDM * 3.5 + fatDM * 8.5 + carbsDM * 3.5;
  // Convert to as-fed kcal/kg: (kcalPer100gDM / 100) * dryMatterPct * 10
  return Math.round((kcalPer100gDM / 100) * dryMatterPct * 10);
}

/**
 * Typical as-fed energy density (kcal/g) per diet component category.
 * Used only when a component is not linked to a catalog product with a real ME.
 */
export const DIET_CATEGORY_DENSITY: Record<string, number> = {
  protein: 1.5, // raw/cooked muscle meat
  organ: 1.3,
  bone: 1.5, // raw meaty bones
  vegetable: 0.5,
  grain: 1.2, // cooked
  supplement: 3.0,
  fat: 8.8, // oils
  commercial: 3.6, // dry kibble; wet food should be linked to the catalog for real ME
};

export interface BuiltDietComponent extends DietTemplateComponent {
  kcal: number;
  kcalPerGram: number;
  percentage: number;
}

/**
 * Calculate a home-cooked / BARF ration directly from the entered component
 * weights. Energy uses each component's real ME (kcal/kg, when linked to the
 * catalog) or a category default. Percentages are derived only for display.
 */
export function calculateDietComponents(
  components: DietTemplateComponent[],
  fallbackDensity = 1.6 // kcal/g when category is unknown
): BuiltDietComponent[] {
  const densityOf = (c: DietTemplateComponent) =>
    c.meKcalPerKg && c.meKcalPerKg > 0
      ? c.meKcalPerKg / 1000
      : DIET_CATEGORY_DENSITY[c.category] ?? fallbackDensity;

  // Values may temporarily arrive as strings from an HTML number input or be
  // absent in an in-memory pre-migration component kept by Fast Refresh.
  const gramsOf = (c: DietTemplateComponent) => {
    const value = Number(c.grams);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  };

  const totalGrams = components.reduce((sum, c) => sum + gramsOf(c), 0);
  return components.map((c) => {
    const density = densityOf(c);
    const grams = gramsOf(c);
    return {
      ...c,
      grams,
      kcal: grams * density,
      kcalPerGram: density,
      percentage: totalGrams > 0 ? (grams / totalGrams) * 100 : 0,
    };
  });
}

export interface DietSummary {
  totalGrams: number;
  totalKcal: number;
  proteinG: number | null; // g/day across components with macro data
  fatG: number | null;
  linkedCount: number; // components linked to catalog products
  macroCoverage: number; // 0..1 share of ration grams with macro data
}

/**
 * Aggregate a built diet: total weight/energy plus protein & fat grams per day
 * where component macro data (from linked catalog products) is available.
 */
export function summarizeDiet(built: BuiltDietComponent[]): DietSummary {
  const totalGrams = built.reduce((s, c) => s + c.grams, 0);
  const totalKcal = built.reduce((s, c) => s + c.kcal, 0);
  const withMacros = built.filter((c) => c.proteinPct != null || c.fatPct != null);
  const coveredGrams = withMacros.reduce((s, c) => s + c.grams, 0);
  return {
    totalGrams,
    totalKcal,
    proteinG: withMacros.length
      ? Math.round(withMacros.reduce((s, c) => s + c.grams * ((c.proteinPct ?? 0) / 100), 0))
      : null,
    fatG: withMacros.length
      ? Math.round(withMacros.reduce((s, c) => s + c.grams * ((c.fatPct ?? 0) / 100), 0))
      : null,
    linkedCount: built.filter((c) => c.productId != null).length,
    macroCoverage: totalGrams > 0 ? coveredGrams / totalGrams : 0,
  };
}

/**
 * Calculate age in years/human-readable from birth date.
 */
export function calculateAge(birthDate: string | Date): { years: number; label: string } {
  const birth = new Date(birthDate);
  const now = new Date();
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) {
    return { years: 0, label: `${remMonths} mo` };
  }
  if (remMonths === 0) {
    return { years, label: `${years} yr` };
  }
  return { years, label: `${years} yr ${remMonths} mo` };
}

/**
 * BCS description (1-9 scale).
 */
export function bcsDescription(bcs: number): { label: string; color: string } {
  if (bcs <= 3) return { label: "Underweight", color: "text-amber-600" };
  if (bcs <= 5) return { label: "Ideal", color: "text-emerald-600" };
  if (bcs <= 6) return { label: "Overweight", color: "text-orange-600" };
  return { label: "Obese", color: "text-red-600" };
}

/**
 * VAS pruritus (itch) score description.
 */
export function vasDescription(score: number): { label: string; color: string } {
  if (score <= 2) return { label: "Minimal itching", color: "text-emerald-600" };
  if (score <= 4) return { label: "Mild itching", color: "text-lime-600" };
  if (score <= 6) return { label: "Moderate itching", color: "text-amber-600" };
  if (score <= 8) return { label: "Severe itching", color: "text-orange-600" };
  return { label: "Extreme itching", color: "text-red-600" };
}
