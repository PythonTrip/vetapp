// VetDietDerm clinical knowledge base constants
import type { Allergen, HandoutTemplate, EliminationProtocolStep } from "./types";

export const ALLERGENS: Allergen[] = [
  // Environmental
  {
    id: "env-dust-mite",
    category: "environmental",
    name: "Dust Mites (Dermatophagoides farinae)",
    description:
      "Most common environmental allergen in dogs. Thrives in bedding, carpets, upholstery. Year-round symptoms with seasonal flares in humid weather.",
    crossReactive: ["Storage mites", "Shrimp (tropomyosin protein)"],
    safeAlternatives: ["Novel protein: venison", "Hydrolyzed diet"],
  },
  {
    id: "env-pollen-grass",
    category: "environmental",
    name: "Grass Pollen (Bermuda, Timothy)",
    description:
      "Seasonal allergen, late spring to summer. Common cause of atopic dermatitis in dogs, especially foot licking and face rubbing.",
    crossReactive: ["Wheat", "Corn", "Rye"],
    safeAlternatives: ["Potato-based diets", "Pea-based diets"],
  },
  {
    id: "env-pollen-tree",
    category: "environmental",
    name: "Tree Pollen (Birch, Oak, Cedar)",
    description:
      "Spring allergens. Birch pollen has well-documented cross-reactivity with raw fruits and vegetables (oral allergy syndrome).",
    crossReactive: ["Apple (raw)", "Carrot (raw)", "Hazelnut", "Soy"],
    safeAlternatives: ["Cooked apple", "Sweet potato", "Green beans"],
  },
  {
    id: "env-flea",
    category: "environmental",
    name: "Flea Saliva",
    description:
      "Most common allergen in cats. Flea allergy dermatitis (FAD) causes intense pruritus, especially over the rump and tail base. A single flea bite can trigger weeks of itching.",
    crossReactive: [],
    safeAlternatives: ["Strict year-round flea control is mandatory"],
  },
  {
    id: "env-mold",
    category: "environmental",
    name: "Mold Spores (Aspergillus, Alternaria)",
    description:
      "Indoor and outdoor molds. Symptoms worsen in damp environments and during autumn leaf decay.",
    crossReactive: [],
    safeAlternatives: ["Dehumidifier", "Air filtration"],
  },

  // Food allergens
  {
    id: "food-beef",
    category: "food",
    name: "Beef",
    description:
      "Most common food allergen in dogs (34% of food allergy cases). Often combined with dairy allergy due to cross-reactive proteins.",
    crossReactive: ["Dairy (casein)", "Lamb (rare)"],
    safeAlternatives: ["Venison", "Duck", "Rabbit", "Pork", "Kangaroo"],
  },
  {
    id: "food-dairy",
    category: "food",
    name: "Dairy (Casein, Whey)",
    description:
      "Second most common food allergen. Many pets also have lactose intolerance, which is a separate non-immunologic issue causing GI signs.",
    crossReactive: ["Beef"],
    safeAlternatives: ["Coconut milk (small amounts)", "No dairy needed in complete diets"],
  },
  {
    id: "food-chicken",
    category: "food",
    name: "Chicken",
    description:
      "Most common food allergen in cats. Found in many commercial diets, making elimination challenging. Often the 'default' protein in veterinary diets.",
    crossReactive: ["Turkey", "Pheasant", "Egg (rare)"],
    safeAlternatives: ["Duck", "Rabbit", "Venison", "Pork", "Fish (salmon)"],
  },
  {
    id: "food-wheat",
    category: "food",
    name: "Wheat / Gluten",
    description:
      "Less common than often thought (true gluten sensitivity is rare in pets). Often confused with grain intolerance. Cross-reacts with grass pollens.",
    crossReactive: ["Grass pollens", "Rye", "Barley"],
    safeAlternatives: ["Rice", "Oats", "Quinoa", "Potato", "Sweet potato"],
  },
  {
    id: "food-soy",
    category: "food",
    name: "Soy",
    description:
      "Common allergen in both dogs and cats. Found as a cheap protein extender in many commercial diets.",
    crossReactive: ["Birch pollen", "Peanut (rare)"],
    safeAlternatives: ["Pea protein", "Lentil", "Chickpea"],
  },
  {
    id: "food-egg",
    category: "food",
    name: "Egg",
    description:
      "Egg white contains several allergenic proteins. Egg yolk is generally better tolerated. Cross-reactivity between white and yolk exists.",
    crossReactive: ["Chicken (rare)", "Other poultry eggs"],
    safeAlternatives: ["No egg needed; use alternative protein sources"],
  },
  {
    id: "food-fish",
    category: "food",
    name: "Fish",
    description:
      "Salmon and tuna are common allergens in cats fed fish-based diets. Cross-reactivity among fish species is common.",
    crossReactive: ["Other fish species", "Shellfish (tropomyosin)"],
    safeAlternatives: ["Whitefish (less commonly allergenic)", "Non-fish novel proteins"],
  },

  // Cross-reactive
  {
    id: "cross-poultry",
    category: "cross_reactive",
    name: "Poultry Cross-Reactivity",
    description:
      "If allergic to chicken, ~40% of dogs also react to turkey and other poultry. Pheasant and quail may be tolerated.",
    crossReactive: ["Chicken", "Turkey", "Pheasant", "Duck (rare)"],
    safeAlternatives: ["Rabbit", "Venison", "Pork", "Kangaroo"],
  },
  {
    id: "cross-ruminant",
    category: "cross_reactive",
    name: "Ruminant Cross-Reactivity",
    description:
      "Beef and lamb share similar proteins. If beef-allergic, lamb is NOT a safe novel protein. Use non-ruminant alternatives.",
    crossReactive: ["Beef", "Lamb", "Goat", "Venison (rare)"],
    safeAlternatives: ["Pork", "Duck", "Rabbit", "Kangaroo", "Horse"],
  },

  // === Phase 8 expansion: more food allergens ===
  {
    id: "food-corn",
    category: "food",
    name: "Corn / Maize",
    description:
      "Common carbohydrate source in commercial diets. Less commonly allergenic than proteins but can cause GI or skin signs in sensitive pets. Often confused with grain allergy.",
    crossReactive: ["Grass pollens (cross-reactive carbohydrate proteins)"],
    safeAlternatives: ["Rice", "Sweet potato", "Potato", "Pea", "Oats"],
  },
  {
    id: "food-rice",
    category: "food",
    name: "Rice",
    description:
      "Rarely allergenic but possible with overexposure. Often used as the 'safe' carbohydrate in elimination diets — true rice allergy is uncommon but documented.",
    crossReactive: [],
    safeAlternatives: ["Potato", "Sweet potato", "Quinoa", "Millet"],
  },
  {
    id: "food-pork",
    category: "food",
    name: "Pork",
    description:
      "Underutilized novel protein for most pets, but allergy can develop with prolonged exposure. Cross-reacts with other mammalian meats in rare cases.",
    crossReactive: ["Pork serum albumin cross-reacts with beef (rare)"],
    safeAlternatives: ["Venison", "Duck", "Rabbit", "Kangaroo"],
  },
  {
    id: "food-lamb",
    category: "food",
    name: "Lamb",
    description:
      "Once a popular novel protein, lamb is now a common allergen due to widespread use in 'hypoallergenic' diets. Cross-reacts with beef — not a safe alternative for beef-allergic pets.",
    crossReactive: ["Beef", "Goat", "Mutton"],
    safeAlternatives: ["Pork", "Duck", "Rabbit", "Venison", "Kangaroo"],
  },
  {
    id: "food-tomato",
    category: "food",
    name: "Tomato",
    description:
      "Solanaceae family. Rare allergen but can cause GI upset in sensitive pets. Green tomatoes contain solanine (toxic). Ripe tomato flesh is generally safe in small amounts.",
    crossReactive: ["Potato (raw)", "Eggplant", "Peppers"],
    safeAlternatives: ["Sweet potato", "Carrot", "Green beans"],
  },
  {
    id: "food-peanut",
    category: "food",
    name: "Peanut",
    description:
      "Legume (not a true nut). Peanut butter is commonly used to hide pills — exposure can sensitize pets. Cross-reacts with soy and other legumes.",
    crossReactive: ["Soy", "Pea", "Other legumes"],
    safeAlternatives: ["Almond butter (small amounts)", "Sunflower seed butter"],
  },

  // === Phase 8 expansion: environmental allergens ===
  {
    id: "env-ragweed",
    category: "environmental",
    name: "Ragweed Pollen",
    description:
      "Late summer/fall allergen (August-October). Major cause of seasonal atopic dermatitis in dogs in North America. Cross-reacts with melon and banana proteins (oral allergy syndrome).",
    crossReactive: ["Melon (cantaloupe, honeydew)", "Banana", "Zucchini", "Cucumber"],
    safeAlternatives: ["Cooked fruits", "Avoid outdoor exposure during peak season"],
  },
  {
    id: "env-mugwort",
    category: "environmental",
    name: "Mugwort Pollen (Artemisia)",
    description:
      "Late summer weed pollen. Common in temperate climates. Cross-reacts with celery, carrot, and some spices — relevant for pets on home-cooked diets.",
    crossReactive: ["Celery", "Carrot (raw)", "Coriander", "Fennel"],
    safeAlternatives: ["Cooked carrot", "Sweet potato", "Green beans"],
  },
  {
    id: "env-plantain",
    category: "environmental",
    name: "English Plantain Pollen",
    description:
      "Common lawn weed pollen, peaks late spring to fall. Often overlooked cause of seasonal paw dermatitis in dogs that walk on grassy areas.",
    crossReactive: [],
    safeAlternatives: ["Wipe paws after walks", "Avoid early morning outdoor activity"],
  },
  {
    id: "env-sheep-sorrel",
    category: "environmental",
    name: "Sheep Sorrel Pollen",
    description:
      "Acidic-soil weed pollen, spring to fall. Less common but increasing in suburban areas. Often co-occurs with grass pollen sensitization.",
    crossReactive: ["Grass pollens"],
    safeAlternatives: ["Air filtration", "Limit outdoor time during peak pollen"],
  },

  // === Phase 8 expansion: regional pollens ===
  {
    id: "env-cedar-japan",
    category: "environmental",
    name: "Japanese Cedar (Sugi) Pollen",
    description:
      "Major seasonal allergen in Japan (Feb-April). Affects both humans and dogs. Increasingly relevant with globalized pet travel and breeding.",
    crossReactive: ["Cypress", "Juniper"],
    safeAlternatives: ["HEPA filtration", "Indoor avoidance during peak season"],
  },
  {
    id: "env-birch",
    category: "environmental",
    name: "Birch Pollen",
    description:
      "Early spring tree pollen (March-May) in temperate climates. Famous for oral allergy syndrome — cross-reacts with raw apple, carrot, hazelnut, and stone fruits.",
    crossReactive: ["Apple (raw)", "Carrot (raw)", "Hazelnut", "Cherry", "Peach", "Soy"],
    safeAlternatives: ["Cooked apple", "Sweet potato", "Green beans", "Cooked carrot"],
  },
  {
    id: "env-mountain-cedar",
    category: "environmental",
    name: "Mountain Cedar Pollen",
    description:
      "Winter allergen (Dec-Feb) in south-central US (Texas, Oklahoma). Produces 'cedar fever' in humans; causes winter atopic flares in dogs in affected regions.",
    crossReactive: ["Juniper", "Cypress"],
    safeAlternatives: ["Air filtration", "Indoor humidity control"],
  },

  // === Phase 8 expansion: indoor/contact allergens ===
  {
    id: "env-storage-mite",
    category: "environmental",
    name: "Storage Mites (Tyrophagus, Acarus)",
    description:
      "Found in stored grains, flour, cereal-based pet food. Cross-reacts with dust mites (70% of dust-mite-allergic pets also react to storage mites). Open pet food bags can harbor them.",
    crossReactive: ["Dust mites", "Shrimp (tropomyosin)"],
    safeAlternatives: ["Seal pet food in airtight containers", "Freeze dry food 24h before serving", "Hydrolyzed diet"],
  },
  {
    id: "env-feather",
    category: "environmental",
    name: "Bird Feather Dander",
    description:
      "Allergen from pet birds and feather-filled bedding/toys. Causes respiratory and skin signs in sensitized dogs and cats. Often co-occurs with dust mite allergy.",
    crossReactive: ["Poultry meat (rare)"],
    safeAlternatives: ["Synthetic bedding", "Remove feather toys", "Air purifier"],
  },
  {
    id: "env-human-dander",
    category: "environmental",
    name: "Human Dander",
    description:
      "Rare but documented — pets can be allergic to human skin flakes. Presents as year-round pruritus with no seasonal pattern. Diagnosis by intradermal testing.",
    crossReactive: [],
    safeAlternatives: ["Limit bedroom access", "Frequent vacuuming", "HEPA filtration"],
  },

  // === Phase 8 expansion: drug/chemical allergens (contact) ===
  {
    id: "env-flea-collar",
    category: "environmental",
    name: "Flea Collar Chemicals (Tetrachlorvinphos)",
    description:
      "Organophosphate flea collars can cause contact dermatitis around the neck. Rare with modern systemic flea preventives but still seen with OTC collars.",
    crossReactive: ["Other organophosphates"],
    safeAlternatives: ["Oral flea preventives (nitenpyram, spinosad, afoxolaner)", "Topical selamectine"],
  },
  {
    id: "env-shampoo",
    category: "environmental",
    name: "Shampoo Surfactants (SLS, Cocamidopropyl Betaine)",
    description:
      "Contact allergy to shampoo ingredients. Presents as ventral dermatitis after bathing. Switch to hypoallergenic or oatmeal-based formulations.",
    crossReactive: ["Other sulfates"],
    safeAlternatives: ["Hypoallergenic pet shampoo", "Oatmeal-based shampoo", "Pure water rinse"],
  },

  // === Phase 8 expansion: additional cross-reactive clusters ===
  {
    id: "cross-nightshade",
    category: "cross_reactive",
    name: "Nightshade Cross-Reactivity",
    description:
      "Pets allergic to one nightshade (potato, tomato, pepper, eggplant) may react to others. Relevant for pets on potato-based elimination diets.",
    crossReactive: ["Potato", "Tomato", "Eggplant", "Bell pepper", "Tomatillo"],
    safeAlternatives: ["Sweet potato (different family)", "Carrot", "Pumpkin", "Green beans"],
  },
  {
    id: "cross-legume",
    category: "cross_reactive",
    name: "Legume Cross-Reactivity",
    description:
      "Soy, pea, peanut, lentil, and chickpea share cross-reactive proteins. Pets allergic to soy (common in commercial diets) may react to 'grain-free' pea-based formulas.",
    crossReactive: ["Soy", "Pea", "Peanut", "Lentil", "Chickpea", "Bean"],
    safeAlternatives: ["Potato", "Sweet potato", "Rice", "Quinoa"],
  },
];

export const ELIMINATION_PROTOCOL_STEPS: EliminationProtocolStep[] = [
  {
    id: "step-1",
    phase: "Preparation",
    title: "Pre-trial Workup",
    description:
      "Rule out parasitic (fleas, mites), infectious (bacterial, fungal), and atopic causes. Perform skin scrapes, cytology, and fungal culture. Ensure strict flea control for at least 4 weeks before starting.",
    duration: "2-4 weeks prior",
    completed: false,
  },
  {
    id: "step-2",
    phase: "Selection",
    title: "Choose Novel Protein or Hydrolyzed Diet",
    description:
      "Select a diet with a single novel protein source the pet has NEVER eaten, or a hydrolyzed protein diet (gold standard). For dogs: venison, rabbit, kangaroo, or hydrolyzed. For cats: rabbit, duck, or hydrolyzed. NO treats, flavored medications, table scraps, or access to other pets' food.",
    duration: "Day 0",
    completed: false,
  },
  {
    id: "step-3",
    phase: "Transition",
    title: "Gradual Diet Transition",
    description:
      "Transition over 5-7 days (25% new → 50% → 75% → 100%) to prevent GI upset. If GI signs occur, slow the transition. For cats, a longer 10-14 day transition may be needed; never fast a cat to force diet change.",
    duration: "Days 1-7",
    completed: false,
  },
  {
    id: "step-4",
    phase: "Strict Elimination",
    title: "Exclusive Diet Feeding",
    description:
      "Feed ONLY the elimination diet. All family members must comply. No flavored toothpaste, no heartworm chews (use topical/topical-only preventives), no rawhide, no dental chews. Use diet kibble as treats. Document any indiscretion immediately in the log.",
    duration: "8-12 weeks minimum",
    completed: false,
  },
  {
    id: "step-5",
    phase: "Monitoring",
    title: "Weekly Pruritus Scoring",
    description:
      "Score pruritus weekly using the Visual Analog Scale (VAS 1-10) or CADESI-4. Photograph lesions every 2 weeks in consistent lighting and angles. Track in the dermatology gallery. Expect improvement by week 4-6 if food-responsive.",
    duration: "Weeks 1-12",
    completed: false,
  },
  {
    id: "step-6",
    phase: "Rechallenge",
    title: "Provocation Challenge",
    description:
      "Only if improvement ≥50% on VAS. Reintroduce the ORIGINAL diet. A relapse within 7-14 days confirms food allergy. If no relapse in 2 weeks, challenge with individual proteins to identify specific triggers.",
    duration: "Weeks 10-14",
    completed: false,
  },
  {
    id: "step-7",
    phase: "Long-term",
    title: "Maintenance Diet Selection",
    description:
      "Identify safe long-term diet based on challenge results. Choose a complete and balanced commercial diet with the tolerated protein(s). Recheck every 6 months; food allergies can develop to new proteins over time.",
    duration: "Ongoing",
    completed: false,
  },
];

export const HANDOUT_TEMPLATES: HandoutTemplate[] = [
  {
    id: "elimination-rules",
    title: "Strict Elimination Diet Rules",
    description:
      "Owner-facing rulesheet for the elimination diet trial. Emphasizes 'nothing else by mouth' rule, treats policy, and what to do during indiscretions.",
    icon: "ClipboardCheck",
  },
  {
    id: "food-transition",
    title: "Safe Transitioning to a New Food",
    description:
      "Step-by-step guide for transitioning pets to a new diet over 7 days to avoid GI upset. Includes a daily mixing schedule.",
    icon: "ArrowRightLeft",
  },
  {
    id: "pruritus-diary",
    title: "Pruritus & Lesion Monitoring Diary",
    description:
      "Instruction sheet for owners to track daily itching scores, photograph lesions consistently, and recognize flare triggers.",
    icon: "NotebookPen",
  },
  {
    id: "medication-admin",
    title: "Medication Administration Guide",
    description:
      "Tips for giving pills to dogs and cats, hiding medications in approved diet treats, and recognizing adverse reactions.",
    icon: "Pill",
  },
  {
    id: "barf-safety",
    title: "Raw Diet (BARF) Safety Guidelines",
    description:
      "Hygiene, handling, and bacterial risk guidelines for owners feeding raw diets. Includes safe thawing and bowl sanitation protocols.",
    icon: "ShieldAlert",
  },
  {
    id: "supplement-guide",
    title: "Supplement Dosing & Safety Guide",
    description:
      "Common supplements (omega-3, probiotics, joint support) with dosing by weight, timing, and contraindications.",
    icon: "FlaskConical",
  },
];

// Safe novel proteins for quick reference
export const NOVEL_PROTEINS = [
  { protein: "Venison", species: ["dog", "cat"], notes: "Lean, well-tolerated, widely available" },
  { protein: "Rabbit", species: ["dog", "cat"], notes: "Excellent for cats; hypoallergenic profile" },
  { protein: "Duck", species: ["dog", "cat"], notes: "Good alternative to chicken" },
  { protein: "Kangaroo", species: ["dog"], notes: "Truly novel for most dogs; expensive" },
  { protein: "Pork", species: ["dog", "cat"], notes: "Underutilized novel protein; cook thoroughly" },
  { protein: "Horse", species: ["dog", "cat"], notes: "Novel; availability varies by region" },
  { protein: "Hydrolyzed soy", species: ["dog", "cat"], notes: "Gold standard; peptides too small to trigger allergy" },
  { protein: "Hydrolyzed chicken", species: ["dog", "cat"], notes: "For pets allergic to intact chicken protein" },
];

// Body regions for lesion photos
export const BODY_REGIONS = [
  "Dorsum",
  "Ventral abdomen",
  "Ears (pinna)",
  "Ear canals",
  "Face / muzzle",
  "Periocular",
  "Paws (dorsal)",
  "Paw pads / interdigital",
  "Axillae",
  "Groin",
  "Tail base / rump",
  "Neck",
  "Generalized",
];

// Species list + per-species presentation metadata (label + avatar colours).
// Adding a species here makes it selectable everywhere; UI helpers below keep
// colours and labels consistent instead of the old binary dog/cat branching.
export const SPECIES_OPTIONS = [
  { value: "dog", label: "Собака" },
  { value: "cat", label: "Кошка" },
  { value: "rabbit", label: "Кролик" },
  { value: "ferret", label: "Хорёк" },
  { value: "rodent", label: "Грызун" },
  { value: "bird", label: "Птица" },
  { value: "reptile", label: "Рептилия" },
  { value: "horse", label: "Лошадь" },
  { value: "other", label: "Другое" },
];

export const SPECIES_VALUES = SPECIES_OPTIONS.map((option) => option.value);

interface SpeciesMeta {
  label: string; // Russian label for the clinician-facing UI
  labelEn: string; // English label for owner-facing reports
  avatar: string; // tailwind classes for the round avatar chip
}

const SPECIES_META: Record<string, SpeciesMeta> = {
  dog: { label: "Собака", labelEn: "Canine", avatar: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" },
  cat: { label: "Кошка", labelEn: "Feline", avatar: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400" },
  rabbit: { label: "Кролик", labelEn: "Rabbit", avatar: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400" },
  ferret: { label: "Хорёк", labelEn: "Ferret", avatar: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400" },
  rodent: { label: "Грызун", labelEn: "Rodent", avatar: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400" },
  bird: { label: "Птица", labelEn: "Bird", avatar: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400" },
  reptile: { label: "Рептилия", labelEn: "Reptile", avatar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" },
  horse: { label: "Лошадь", labelEn: "Equine", avatar: "bg-stone-200 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300" },
  other: { label: "Другое", labelEn: "Other", avatar: "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300" },
};

const FALLBACK_SPECIES_META: SpeciesMeta = SPECIES_META.other;

export function speciesMeta(species: string): SpeciesMeta {
  return SPECIES_META[species] ?? FALLBACK_SPECIES_META;
}

export function speciesLabel(species: string): string {
  return speciesMeta(species).label;
}

export function speciesLabelEn(species: string): string {
  return speciesMeta(species).labelEn;
}

export function speciesAvatarClass(species: string): string {
  return speciesMeta(species).avatar;
}

// Best-effort split of a legacy combined "email · phone" contact string so a
// pet created before the split still shows structured email/phone.
export function splitOwnerContact(contact: string | null | undefined): { email: string; phone: string } {
  if (!contact) return { email: "", phone: "" };
  const parts = contact.split(/[·,;|]| - /).map((p) => p.trim()).filter(Boolean);
  let email = "";
  let phone = "";
  for (const part of parts) {
    if (!email && part.includes("@")) email = part;
    else if (!phone && /[\d+()]/.test(part)) phone = part;
  }
  if (!email && !phone) {
    if (contact.includes("@")) email = contact.trim();
    else phone = contact.trim();
  }
  return { email, phone };
}

export const LIFE_STAGE_OPTIONS = [
  { value: "puppy_kitten", label: "Puppy / Kitten (< 1 yr)" },
  { value: "adult", label: "Adult" },
  { value: "senior", label: "Senior" },
  { value: "gestation", label: "Gestation" },
  { value: "lactation", label: "Lactation" },
];

export const ACTIVITY_OPTIONS = [
  { value: "low", label: "Low (couch potato / weight loss)" },
  { value: "moderate", label: "Moderate (typical pet)" },
  { value: "high", label: "High (working / sporting)" },
  { value: "very_high", label: "Very high (endurance sled / hunting)" },
];
