// VetDietDerm — Drug Interaction Database for Clinical Decision Support
// Curated veterinary drug interactions with severity, mechanism, and recommendations.
// Used by CDS engine to scan consultation notes & treatment plans.

export type InteractionSeverity = "contraindicated" | "major" | "moderate" | "minor";

export interface DrugInteraction {
  id: string;
  drugA: string;
  drugB: string;
  severity: InteractionSeverity;
  mechanism: string;
  effect: string;
  recommendation: string;
  // Alternative time window (hours) — if drugs given X hours apart, interaction is mitigated
  minSeparationHours?: number;
}

// Keywords used to detect drug mentions in clinical notes (lowercase)
export const DRUG_KEYWORDS: Record<string, string[]> = {
  nsaids: ["nsaid", "carprofen", "rimadyl", "meloxicam", "metacam", "deracoxib", "galliprant", "firocoxib", "robenacoxib", "aspirin", "ibuprofen", "naproxen"],
  corticosteroids: ["prednisolone", "prednisone", "dexamethasone", "dex", "triamcinolone", "methylprednisolone", "steroid"],
  ace_inhibitors: ["benazepril", "fortekor", "enalapril", "imidapril"],
  arb: ["telmisartan", "olmesartan"],
  furosemide: ["furosemide", "frusemide", "lasix"],
  spironolactone: ["spironolactone", "prilactone"],
  ace_inhibitors_combined: ["benazepril", "enalapril"],
  aminoglycosides: ["gentamicin", "amikacin", "tobramycin", "neomycin"],
  loop_diuretics: ["furosemide", "torsemide"],
  cns_depressants: ["gabapentin", "trazodone", "acepromazine", "diazepam", "midazolam", "buprenorphine", "methadone", "maropitant", "ondansetron"],
  mao_inhibitors: ["selegiline", "anipryl", "tranylcypromine"],
  ssris: ["fluoxetine", "reconcile", "clomipramine", "clomicalm", "sertraline"],
  warfarin: ["warfarin"],
  cyclosporine: ["cyclosporine", "atopica", "modulis"],
  oclacitinib: ["oclacitinib", "apoquel"],
  cyclophosphamide: ["cyclophosphamide"],
  digoxin: ["digoxin"],
  theophylline: ["theophylline"],
  fluoroquinolones: ["enrofloxacin", "baytril", "ciprofloxacin", "marbofloxacin", "orbifloxacin"],
  ketoconazole: ["ketoconazole", "nizoral"],
  itraconazole: ["itraconazole", "sporanox"],
  fluconazole: ["fluconazole"],
  phenobarbital: ["phenobarbital", "phenobarbitone"],
  potassium_supplements: ["potassium", "kcl", "spironolactone"],
  acepromazine: ["acepromazine", "ace", "acp"],
  metronidazole: ["metronidazole", "flagyl"],
  vit_k: ["vitamin k", "phytonadione"],
  thyroid: ["levothyroxine", "methimazole", "thyronorm", "felimazole"],
  insulin: ["insulin", "lente", "caninsulin", "prozinc"],
};

export const DRUG_INTERACTIONS: DrugInteraction[] = [
  {
    id: "nsaid-steroid",
    drugA: "NSAIDs",
    drugB: "Corticosteroids",
    severity: "contraindicated",
    mechanism: "Both inhibit prostaglandin synthesis; synergistic GI ulceration and renal vasoconstriction",
    effect: "Severe GI ulceration, perforation, and acute kidney injury",
    recommendation: "Do NOT co-administer. Washout 5-7 days between NSAID and steroid. If both needed urgently, use gastroprotection (misoprostol, sucralfate) and intensive monitoring.",
  },
  {
    id: "nsaid-nsaid",
    drugA: "NSAIDs",
    drugB: "NSAIDs (another)",
    severity: "contraindicated",
    mechanism: "Additive toxicity with no additive efficacy",
    effect: "GI ulceration, renal failure",
    recommendation: "Never combine two NSAIDs. Washout 5-7 days minimum before switching.",
  },
  {
    id: "nsaid-ace",
    drugA: "NSAIDs",
    drugB: "ACE inhibitors",
    severity: "major",
    mechanism: "NSAIDs reduce prostaglandin-mediated afferent arteriolar dilation; ACE inhibitors reduce efferent arteriolar resistance — combined hypoperfusion",
    effect: "Acute kidney injury, especially in dehydrated or cardiac patients",
    recommendation: "Ensure hydration, monitor renal values q2-4 weeks. Consider alternative analgesia.",
  },
  {
    id: "nsaid-loop",
    drugA: "NSAIDs",
    drugB: "Loop diuretics (furosemide)",
    severity: "major",
    mechanism: "NSAIDs blunt prostaglandin-mediated renal blood flow; diuretics cause volume depletion",
    effect: "Acute renal failure, especially in heart failure patients",
    recommendation: "Monitor BUN/creatinine and electrolytes closely. Use lowest effective furosemide dose.",
  },
  {
    id: "steroid-loop",
    drugA: "Corticosteroids",
    drugB: "Loop diuretics (furosemide)",
    severity: "major",
    mechanism: "Steroids cause potassium wasting; furosemide causes potassium wasting — additive hypokalemia",
    effect: "Severe hypokalemia, muscle weakness, cardiac arrhythmias",
    recommendation: "Monitor potassium q3-5 days; supplement K+ as needed.",
  },
  {
    id: "ace-spironolactone",
    drugA: "ACE inhibitors",
    drugB: "Spironolactone",
    severity: "moderate",
    mechanism: "Both increase potassium retention (RAAS blockade)",
    effect: "Hyperkalemia, especially in renal disease",
    recommendation: "Standard combination in cardiac therapy — monitor K+ q1-2 weeks initially. Avoid in renal failure without monitoring.",
  },
  {
    id: "aminoglycoside-furosemide",
    drugA: "Aminoglycosides",
    drugB: "Loop diuretics (furosemide)",
    severity: "contraindicated",
    mechanism: "Both ototoxic and nephrotoxic — synergistic damage",
    effect: "Irreversible deafness and acute kidney injury",
    recommendation: "Avoid concurrent use. If unavoidable, intense renal monitoring and shortest course possible.",
  },
  {
    id: "maoi-ssri",
    drugA: "MAO inhibitors (selegiline)",
    drugB: "SSRIs / TCAs",
    severity: "contraindicated",
    mechanism: "MAOIs prevent serotonin breakdown; SSRIs prevent reuptake — serotonin accumulation",
    effect: "Serotonin syndrome: hyperthermia, tremors, seizures, death",
    recommendation: "Minimum 2-week washout (5 weeks for fluoxetine due to long half-life) before switching.",
  },
  {
    id: "maoi-tramadol",
    drugA: "MAO inhibitors (selegiline)",
    drugB: "Tramadol",
    severity: "contraindicated",
    mechanism: "Tramadol has weak SNRI activity; selegiline inhibits MAO-B — risk of serotonin syndrome",
    effect: "Serotonin syndrome, CNS excitation",
    recommendation: "Avoid combination. Use alternative opioid (e.g., buprenorphine).",
  },
  {
    id: "cyclosporine-ketoconazole",
    drugA: "Cyclosporine",
    drugB: "Ketoconazole / Itraconazole",
    severity: "moderate",
    mechanism: "Azoles inhibit CYP3A4 → ↑ cyclosporine levels 2-5x",
    effect: "Cyclosporine toxicity ( nephrotoxicity, gingival hyperplasia)",
    recommendation: "Reduce cyclosporine dose by 50-75% when co-prescribed. Monitor levels and renal values.",
  },
  {
    id: "oclacitinib-cyclosporine",
    drugA: "Oclacitinib (Apoquel)",
    drugB: "Cyclosporine",
    severity: "moderate",
    mechanism: "Additive immunosuppression",
    effect: "Increased infection risk, poor vaccine response",
    recommendation: "Generally avoid combining. If needed for refractory cases, monitor for opportunistic infections.",
  },
  {
    id: "oclacitinib-steroid",
    drugA: "Oclacitinib (Apoquel)",
    drugB: "Corticosteroids",
    severity: "moderate",
    mechanism: "Additive immunomodulation; both suppress cytokines",
    effect: "Increased infection risk, demodicosis reactivation",
    recommendation: "Taper steroid within 2 weeks of starting oclacitinib. Avoid long-term combination.",
  },
  {
    id: "phenobarbital-fluoroquinolone",
    drugA: "Phenobarbital",
    drugB: "Fluoroquinolones",
    severity: "minor",
    mechanism: "Phenobarbital induces CYP → lowers fluoroquinolone levels",
    effect: "Reduced antibiotic efficacy",
    recommendation: "Consider dose adjustment or alternative antibiotic class.",
  },
  {
    id: "phenobarbital-ketoconazole",
    drugA: "Phenobarbital",
    drugB: "Ketoconazole",
    severity: "major",
    mechanism: "Ketoconazole inhibits phenobarbital metabolism; phenobarbital induces ketoconazole metabolism",
    effect: "Unpredictable phenobarbital toxicity (sedation, ataxia) or ineffective antifungal",
    recommendation: "Avoid combination. Use alternative antifungal (terbinafine) or anticonvulsant.",
  },
  {
    id: "metronidazole-warfarin",
    drugA: "Metronidazole",
    drugB: "Warfarin",
    severity: "major",
    mechanism: "Metronidazole inhibits warfarin metabolism via CYP2C9",
    effect: "Severe bleeding (elevated INR)",
    recommendation: "Reduce warfarin dose 25-50% if co-prescribed. Monitor PT/INR closely.",
  },
  {
    id: "cyclophosphamide-steroid",
    drugA: "Cyclophosphamide",
    drugB: "Corticosteroids",
    severity: "moderate",
    mechanism: "Additive immunosuppression; both part of CHOP protocol but require monitoring",
    effect: "Myelosuppression, infection risk",
    recommendation: "Standard in chemotherapy protocols. Monitor CBC q1-2 weeks. Use prophylactic antibiotics if neutropenic.",
  },
  {
    id: "digoxin-furosemide",
    drugA: "Digoxin",
    drugB: "Loop diuretics (furosemide)",
    severity: "moderate",
    mechanism: "Furosemide causes hypokalemia → increases digoxin toxicity risk",
    effect: "Digoxin toxicity: arrhythmias, anorexia, vomiting",
    recommendation: "Maintain K+ 4.0-5.0 mEq/L. Monitor digoxin levels.",
  },
  {
    id: "fluoxetine-tramadol",
    drugA: "SSRIs (fluoxetine)",
    drugB: "Tramadol",
    severity: "major",
    mechanism: "Both increase serotonin — risk of serotonin syndrome",
    effect: "Tremors, hyperthermia, seizures",
    recommendation: "Use alternative opioid. If combined, use lowest tramadol dose, monitor for agitation/tremors.",
  },
  {
    id: "acepromazine-phenobarbital",
    drugA: "Acepromazine",
    drugB: "Phenobarbital",
    severity: "moderate",
    mechanism: "Additive CNS depression",
    effect: "Excessive sedation, hypotension, bradycardia",
    recommendation: "Reduce acepromazine dose by 50% in epileptic patients on phenobarbital.",
  },
  {
    id: "thyroid-methimazole-warfarin",
    drugA: "Methimazole",
    drugB: "Warfarin",
    severity: "minor",
    mechanism: "Methimazole may reduce warfarin clearance",
    effect: "Mild INR elevation",
    recommendation: "Monitor INR when starting/stopping methimazole in warfarin patients.",
  },
];

export interface DetectedInteraction {
  interaction: DrugInteraction;
  matchedDrugsA: string[];
  matchedDrugsB: string[];
}

/**
 * Scan free-text clinical notes for drug names and return any detected interactions.
 */
export function checkDrugInteractions(text: string): DetectedInteraction[] {
  const lower = text.toLowerCase();
  const detected: DetectedInteraction[] = [];

  for (const interaction of DRUG_INTERACTIONS) {
    const matchesA = DRUG_KEYWORDS[interaction.drugA.toLowerCase().replace(/[^a-z_]/g, "_").replace(/\s+/g, "_")] ?? [];
    const matchesB = DRUG_KEYWORDS[interaction.drugB.toLowerCase().replace(/[^a-z_]/g, "_").replace(/\s+/g, "_")] ?? [];

    // Also try direct drug name from the interaction itself
    const candidatesA = [...matchesA, interaction.drugA.toLowerCase()];
    const candidatesB = [...matchesB, interaction.drugB.toLowerCase()];

    // Build regex patterns to match whole-word drug names
    const foundA = candidatesA.filter((kw) => {
      const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${safe}\\b`, "i").test(lower);
    });
    const foundB = candidatesB.filter((kw) => {
      const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${safe}\\b`, "i").test(lower);
    });

    if (foundA.length > 0 && foundB.length > 0) {
      detected.push({
        interaction,
        matchedDrugsA: [...new Set(foundA)],
        matchedDrugsB: [...new Set(foundB)],
      });
    }
  }

  // Sort by severity
  const order: Record<InteractionSeverity, number> = { contraindicated: 0, major: 1, moderate: 2, minor: 3 };
  detected.sort((a, b) => order[a.interaction.severity] - order[b.interaction.severity]);
  return detected;
}

export const SEVERITY_META: Record<InteractionSeverity, { label: string; color: string; bg: string; border: string; icon: string }> = {
  contraindicated: {
    label: "Contraindicated",
    color: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    border: "border-rose-300 dark:border-rose-800",
    icon: "XOctagon",
  },
  major: {
    label: "Major",
    color: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-300 dark:border-amber-800",
    icon: "AlertTriangle",
  },
  moderate: {
    label: "Moderate",
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-300 dark:border-orange-800",
    icon: "AlertCircle",
  },
  minor: {
    label: "Minor",
    color: "text-teal-700 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    border: "border-teal-300 dark:border-teal-800",
    icon: "Info",
  },
};
