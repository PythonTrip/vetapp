// VetDietDerm — Clinical Decision Support (CDS) Alerts Engine
// Generates intelligent, breed- & condition-specific alerts from a pet's record.

import type { PetWithRelations } from "./types";

export type AlertSeverity = "info" | "warning" | "critical" | "success";

export interface ClinicalAlert {
  id: string;
  severity: AlertSeverity;
  category: "weight" | "dermatology" | "breed" | "nutrition" | "followup" | "compliance";
  title: string;
  message: string;
  recommendation?: string;
  icon?: string;
}

// Breed-specific predispositions (selected high-prevalence conditions)
const BREED_PREDISPOSITIONS: Record<string, { species: string; conditions: { condition: string; advice: string }[] }> = {
  // Dogs
  "french bulldog": {
    species: "dog",
    conditions: [
      { condition: "Brachycephalic Obstructive Airway Syndrome (BOAS)", advice: "Avoid heat stress; consider pre-anesthetic airway assessment." },
      { condition: "Atopic dermatitis", advice: "High breed risk — monitor paw licking & ear inflammation early." },
      { condition: "Intervertebral disc disease", advice: "Maintain lean BCS (4-5/9) to reduce spinal load." },
    ],
  },
  "golden retriever": {
    species: "dog",
    conditions: [
      { condition: "Hot spots (acute moist dermatitis)", advice: "Dry coat promptly after swimming; check weekly for focal lesions." },
      { condition: "Hip dysplasia", advice: "Keep BCS ≤ 5/9; omega-3 supplementation may help." },
      { condition: "Dietary sensitivity", advice: "Higher rate of food allergy — consider elimination trial for chronic GI or skin signs." },
    ],
  },
  "labrador retriever": {
    species: "dog",
    conditions: [
      { condition: "Obesity predisposition", advice: "Strict portion control; treat calories <10% daily MER." },
      { condition: "Ear otitis", advice: "Weekly ear cleaner; dry ears after swimming." },
    ],
  },
  "german shepherd": {
    species: "dog",
    conditions: [
      { condition: "Exocrine pancreatic insufficiency (EPI)", advice: "Watch for weight loss with polyphagia — consider TLI test." },
      { condition: "Hip & elbow dysplasia", advice: "Maintain lean BCS; puppy growth should be slow." },
    ],
  },
  "pug": {
    species: "dog",
    conditions: [
      { condition: "BOAS", advice: "Avoid heat; surgical correction may be needed if stertor or exercise intolerance." },
      { condition: "Skin fold pyoderma", advice: "Clean facial folds daily with medicated wipes." },
    ],
  },
  "bulldog": {
    species: "dog",
    conditions: [
      { condition: "BOAS & skin fold dermatitis", advice: "Maintain lean BCS; clean folds daily." },
      { condition: "Hip dysplasia", advice: "Keep BCS lean; joint support supplement." },
    ],
  },
  // Cats
  "domestic shorthair": {
    species: "cat",
    conditions: [
      { condition: "Obesity & FLUTD risk", advice: "Encourage water intake; canned food preferred for weight management." },
      { condition: "Dental disease", advice: "Annual oral exam; consider daily brushing." },
    ],
  },
  "maine coon": {
    species: "cat",
    conditions: [
      { condition: "Hypertrophic cardiomyopathy (HCM)", advice: "Annual echocardiogram after age 3." },
      { condition: "Hip dysplasia", advice: "Maintain lean BCS." },
    ],
  },
  "persian": {
    species: "cat",
    conditions: [
      { condition: "Polycystic kidney disease (PKD)", advice: "Annual renal ultrasound if lineage unknown." },
      { condition: "Facial dermatitis", advice: "Clean facial folds; monitor for Malassezia." },
    ],
  },
  "siamese": {
    species: "cat",
    conditions: [
      { condition: "Asthma & dental malocclusions", advice: "Watch for coughing; dental check at each visit." },
    ],
  },
  "sphynx": {
    species: "cat",
    conditions: [
      { condition: "Hereditary myopathy & skin seborrhea", advice: "Weekly medicated bath; monitor for respiratory weakness." },
    ],
  },
};

function daysSince(date: string | Date): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Generate all clinical alerts for a pet record.
 * Order: critical → warning → info → success
 */
export function generateClinicalAlerts(pet: PetWithRelations): ClinicalAlert[] {
  const alerts: ClinicalAlert[] = [];
  const breedLower = pet.breed.toLowerCase();
  const lastVisit = pet.consultations.at(-1);
  const previousVisit = pet.consultations.at(-2);
  const lastVas = lastVisit?.vasScore;
  const prevVas = previousVisit?.vasScore;
  const hasDietPlan = pet.dietPlans.length > 0;

  // 1. BCS — severe obesity
  if (pet.bcs >= 8) {
    alerts.push({
      id: "bcs-obese",
      severity: "critical",
      category: "weight",
      title: "Obese — weight loss plan required",
      message: `BCS ${pet.bcs}/9 indicates obesity. ${pet.species === "cat" ? "Cats must lose weight at ≤1-2% body weight/week to avoid hepatic lipidosis." : "Reduce MER to 80% of ideal-weight MER; recheck every 4 weeks."}`,
      recommendation: "Set target weight; start weight-loss diet; recheck in 4 weeks.",
      icon: "AlertTriangle",
    });
  } else if (pet.bcs === 7) {
    alerts.push({
      id: "bcs-overweight",
      severity: "warning",
      category: "weight",
      title: "Overweight — weight management advised",
      message: `BCS ${pet.bcs}/9 (overweight). Reduce daily kcal by 15-20%; increase activity.`,
      icon: "Scale",
    });
  } else if (pet.bcs <= 3) {
    alerts.push({
      id: "bcs-underweight",
      severity: "warning",
      category: "weight",
      title: "Underweight — diagnostic workup advised",
      message: `BCS ${pet.bcs}/9 indicates underweight. Investigate GI disease, endocrinopathy, dental pain, or neoplasia.`,
      recommendation: "Run CBC/chem, fecal, TLI/B12/folate; consider diet trial with high-calorie recovery diet.",
      icon: "Scale",
    });
  } else if (pet.bcs >= 4 && pet.bcs <= 5) {
    alerts.push({
      id: "bcs-ideal",
      severity: "success",
      category: "weight",
      title: "Ideal body condition",
      message: `BCS ${pet.bcs}/9 — at ideal weight. Maintain current feeding plan; recheck every 6 months.`,
      icon: "Check",
    });
  }

  // 2. VAS trend — worsening pruritus
  if (lastVas != null && prevVas != null) {
    const delta = lastVas - prevVas;
    if (delta >= 3) {
      alerts.push({
        id: "vas-worsening",
        severity: "critical",
        category: "dermatology",
        title: "Pruritus significantly worse",
        message: `VAS jumped from ${prevVas} → ${lastVas} (+${delta}). Investigate flare triggers: infection, allergen exposure, diet non-compliance, or secondary otitis.`,
        recommendation: "Cytology; reassess therapy; consider anti-inflammatory pulse.",
        icon: "TrendingUp",
      });
    } else if (delta >= 1 && lastVas >= 6) {
      alerts.push({
        id: "vas-elevated",
        severity: "warning",
        category: "dermatology",
        title: "Pruritus elevated",
        message: `VAS ${lastVas}/10 with rising trend. Monitor closely; ensure topical therapy compliance.`,
        icon: "TrendingUp",
      });
    } else if (delta <= -2) {
      alerts.push({
        id: "vas-improving",
        severity: "success",
        category: "dermatology",
        title: "Pruritus improving",
        message: `VAS improved from ${prevVas} → ${lastVas} (-${Math.abs(delta)}). Continue current therapy.`,
        icon: "TrendingDown",
      });
    }
  }

  if (lastVas != null && lastVas >= 7 && (prevVas == null || prevVas === lastVas)) {
    alerts.push({
      id: "vas-severe",
      severity: "critical",
      category: "dermatology",
      title: "Severe pruritus",
      message: `VAS ${lastVas}/10 — severe itch. Quality of life impacted. Escalate therapy.`,
      recommendation: "Consider short course anti-inflammatory; reassess in 7-14 days.",
      icon: "AlertTriangle",
    });
  }

  // 3. Breed-specific predispositions
  for (const [breedKey, data] of Object.entries(BREED_PREDISPOSITIONS)) {
    if (breedLower.includes(breedKey) && data.species === pet.species) {
      const topCondition = data.conditions[0];
      const otherCount = data.conditions.length - 1;
      alerts.push({
        id: `breed-${breedKey.replace(/\s+/g, "-")}`,
        severity: "info",
        category: "breed",
        title: `${pet.breed} — breed predisposition`,
        message: `High risk: ${topCondition.condition}. ${topCondition.advice}${otherCount > 0 ? ` (+${otherCount} more conditions tracked)` : ""}`,
        recommendation: "Screen proactively at each visit.",
        icon: "Dna",
      });
      break;
    }
  }

  // 4. Recheck overdue — chronic dermatology case with no recent visit
  if (lastVisit && lastVas != null && lastVas >= 4) {
    const daysSinceVisit = daysSince(lastVisit.date);
    if (daysSinceVisit > 90) {
      alerts.push({
        id: "recheck-overdue",
        severity: "warning",
        category: "followup",
        title: "Recheck overdue",
        message: `Last visit was ${daysSinceVisit} days ago for a case with VAS ${lastVas}/10. Chronic dermatology cases benefit from 4-8 week rechecks.`,
        recommendation: "Schedule a recheck appointment.",
        icon: "CalendarClock",
      });
    }
  }

  // 5. Diet trial compliance — pet has pruritus but no diet plan
  if ((lastVas ?? 0) >= 5 && !hasDietPlan) {
    alerts.push({
      id: "compliance-no-diet",
      severity: "warning",
      category: "compliance",
      title: "No diet plan on file",
      message: `Active pruritus (VAS ${lastVas}/10) without a saved diet plan. If food allergy is suspected, document an elimination trial or current diet.`,
      recommendation: "Use the Nutritionist Assistant to build & save a diet plan.",
      icon: "ClipboardList",
    });
  }

  // 6. Cat-specific rapid weight loss warning
  if (pet.species === "cat" && pet.targetWeight != null && pet.targetWeight < pet.currentWeight) {
    const lossPct = ((pet.currentWeight - pet.targetWeight) / pet.currentWeight) * 100;
    if (lossPct > 15) {
      alerts.push({
        id: "cat-rapid-loss",
        severity: "warning",
        category: "weight",
        title: "Cat weight-loss target — proceed cautiously",
        message: `Target weight loss is ${lossPct.toFixed(0)}% of body weight. Cats must lose ≤1-2%/week to avoid hepatic lipidosis. Aim for ${Math.ceil((lossPct / 1.5))}+ weeks.`,
        recommendation: "Recheck weight every 2 weeks; halt loss if cat stops eating.",
        icon: "AlertCircle",
      });
    }
  }

  // 7. Senior pet — annual screening reminder
  const ageYears = (Date.now() - new Date(pet.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (pet.lifeStage === "senior" || (pet.species === "dog" && ageYears > 7) || (pet.species === "cat" && ageYears > 10)) {
    const lastBloodwork = pet.consultations.find((c) => c.notes.toLowerCase().includes("cbc") || c.notes.toLowerCase().includes("chemistry") || c.notes.toLowerCase().includes("bloodwork"));
    if (!lastBloodwork) {
      alerts.push({
        id: "senior-screening",
        severity: "info",
        category: "followup",
        title: "Senior wellness screening",
        message: `${pet.name} is a senior (${ageYears.toFixed(1)} yr). Annual CBC/chem/T4 (cats) recommended.`,
        icon: "Stethoscope",
      });
    }
  }

  // 8. Neutered + overweight combo — metabolic slowdown
  if (pet.neutered && pet.bcs >= 6) {
    alerts.push({
      id: "neutered-metabolic",
      severity: "info",
      category: "nutrition",
      title: "Neutered & overweight — lower MER",
      message: "Neutered pets have ~25% lower MER than intact. Apply 1.6× RER factor (vs 1.8× intact) and treat-calorie budget.",
      icon: "Info",
    });
  }

  // Sort by severity: critical > warning > info > success
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

// Stats summary
export function alertStats(alerts: ClinicalAlert[]) {
  return {
    total: alerts.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
    success: alerts.filter((a) => a.severity === "success").length,
  };
}
