"use client";

import * as React from "react";
import {
  Wand2, ChevronRight, ChevronLeft, Check, X, Sparkles, PawPrint,
  Beaker, Salad, Info, AlertTriangle, RotateCcw, ClipboardCheck,
  Bird, Fish, Beef, Rabbit, Leaf,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ALLERGENS, NOVEL_PROTEINS } from "@/lib/clinical-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Species = "dog" | "cat";

interface WizardState {
  species: Species;
  selectedAllergens: Set<string>;
  previousDiets: Set<string>;
}

const TOTAL_STEPS = 4;

const PREVIOUS_DIET_OPTIONS = [
  { id: "chicken", label: "Chicken", icon: Bird, common: true },
  { id: "beef", label: "Beef", icon: Beef, common: true },
  { id: "lamb", label: "Lamb", icon: Beef, common: true },
  { id: "fish", label: "Fish (salmon/whitefish)", icon: Fish, common: true },
  { id: "dairy", label: "Dairy products", icon: Salad, common: true },
  { id: "egg", label: "Egg", icon: Salad, common: false },
  { id: "wheat", label: "Wheat / grains", icon: Leaf, common: true },
  { id: "soy", label: "Soy", icon: Leaf, common: false },
  { id: "turkey", label: "Turkey", icon: Bird, common: false },
  { id: "pork", label: "Pork", icon: Beef, common: false },
  { id: "venison", label: "Venison", icon: Rabbit, common: false },
  { id: "duck", label: "Duck", icon: Bird, common: false },
  { id: "rabbit", label: "Rabbit", icon: Rabbit, common: false },
  { id: "hydrolyzed", label: "Hydrolyzed diet (previous)", icon: Beaker, common: false },
];

// Build a map from allergen name keywords → related allergens to detect conflicts
// We'll match novel proteins by checking if their name is in selectedAllergens or their cross-reactants
function buildAllergenKeywords(allergenIds: Set<string>) {
  const keywords = new Set<string>();
  for (const id of allergenIds) {
    const allergen = ALLERGENS.find((a) => a.id === id);
    if (!allergen) continue;
    // Add the allergen name keywords
    const nameWords = allergen.name.toLowerCase().split(/[\s(,)]+/).filter((w) => w.length > 2);
    nameWords.forEach((w) => keywords.add(w));
    // Add cross-reactants
    allergen.crossReactive.forEach((cr) => {
      const words = cr.toLowerCase().split(/[\s(,)]+/).filter((w) => w.length > 2);
      words.forEach((w) => keywords.add(w));
    });
  }
  return keywords;
}

interface Recommendation {
  protein: string;
  suitable: boolean;
  reason: string;
  confidence: "high" | "medium" | "low";
  species: string[];
  notes: string;
}

function buildRecommendations(state: WizardState): Recommendation[] {
  const allergenKeywords = buildAllergenKeywords(state.selectedAllergens);
  const prevDiets = state.previousDiets;
  const recommendations: Recommendation[] = [];

  for (const np of NOVEL_PROTEINS) {
    // Filter by species
    if (!np.species.includes(state.species)) {
      recommendations.push({
        protein: np.protein,
        suitable: false,
        reason: `Not recommended for ${state.species}s`,
        confidence: "low",
        species: np.species,
        notes: np.notes,
      });
      continue;
    }

    // Check if protein was previously fed
    const proteinLower = np.protein.toLowerCase();
    const wasPreviouslyFed = Array.from(prevDiets).some((d) => proteinLower.includes(d.toLowerCase()) || d.toLowerCase().includes(proteinLower));

    // Check for allergen conflicts
    const conflictWords: string[] = [];
    for (const kw of allergenKeywords) {
      if (proteinLower.includes(kw)) conflictWords.push(kw);
    }

    if (wasPreviouslyFed) {
      recommendations.push({
        protein: np.protein,
        suitable: false,
        reason: "Previously fed — not a novel protein for this patient",
        confidence: "high",
        species: np.species,
        notes: np.notes,
      });
    } else if (conflictWords.length > 0) {
      recommendations.push({
        protein: np.protein,
        suitable: false,
        reason: `Cross-reacts with known allergen: ${conflictWords.join(", ")}`,
        confidence: "high",
        species: np.species,
        notes: np.notes,
      });
    } else {
      // Suitable! Determine confidence
      const isHydrolyzed = proteinLower.includes("hydrolyzed");
      const isCommonProtein = ["venison", "rabbit", "duck"].includes(proteinLower.split(" ")[0]);
      const confidence: Recommendation["confidence"] = isHydrolyzed ? "high" : isCommonProtein ? "high" : "medium";

      recommendations.push({
        protein: np.protein,
        suitable: true,
        reason: isHydrolyzed
          ? "Gold standard — hydrolyzed peptides are too small to trigger an immune response."
          : "Truly novel for this patient — no allergen or dietary overlap detected.",
        confidence,
        species: np.species,
        notes: np.notes,
      });
    }
  }

  // Sort: suitable first (by confidence), then unsuitable
  const order = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => {
    if (a.suitable !== b.suitable) return a.suitable ? -1 : 1;
    return order[a.confidence] - order[b.confidence];
  });

  return recommendations;
}

const PROTEIN_ICONS: Record<string, React.ElementType> = {
  Venison: Beef,
  Rabbit: Rabbit,
  Duck: Bird,
  Kangaroo: Beef,
  Pork: Beef,
  Horse: Beef,
  "Hydrolyzed soy": Beaker,
  "Hydrolyzed chicken": Beaker,
};

export function EliminationWizard() {
  const [step, setStep] = React.useState(0);
  const [state, setState] = React.useState<WizardState>({
    species: "dog",
    selectedAllergens: new Set(),
    previousDiets: new Set(),
  });

  const recommendations = React.useMemo(() => buildRecommendations(state), [state]);
  const suitable = recommendations.filter((r) => r.suitable);
  const progress = Math.round(((step + 1) / TOTAL_STEPS) * 100);

  function toggle(set: "allergens" | "diets", id: string) {
    setState((prev) => {
      const next = { ...prev };
      const target = set === "allergens" ? new Set(prev.selectedAllergens) : new Set(prev.previousDiets);
      if (target.has(id)) target.delete(id);
      else target.add(id);
      if (set === "allergens") next.selectedAllergens = target;
      else next.previousDiets = target;
      return next;
    });
  }

  function reset() {
    setStep(0);
    setState({ species: "dog", selectedAllergens: new Set(), previousDiets: new Set() });
    toast.info("Wizard reset");
  }

  const foodAllergens = ALLERGENS.filter((a) => a.category === "food" || a.category === "cross_reactive");

  return (
    <Card className="overflow-hidden border-2 border-primary/20">
      <CardHeader className="bg-gradient-to-r from-primary/10 via-emerald-500/5 to-transparent pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" /> Elimination Diet Wizard
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Get a personalized novel-protein recommendation in 3 quick steps — powered by the allergen cross-reactivity matrix.
            </CardDescription>
          </div>
          {step > 0 && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs shrink-0" onClick={reset}>
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Progress value={progress} className="h-1.5 flex-1" />
          <Badge variant="secondary" className="text-[10px] tabular-nums">Step {step + 1}/{TOTAL_STEPS}</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5">
        {/* Step 0: Species selection */}
        {step === 0 && (
          <div className="space-y-4 animate-fade-in-up">
            <div>
              <h3 className="text-sm font-semibold mb-1">What species is the patient?</h3>
              <p className="text-xs text-muted-foreground">This filters the protein recommendations to species-appropriate options.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["dog", "cat"] as const).map((sp) => {
                const Icon = sp === "dog" ? PawPrint : PawPrint;
                const isActive = state.species === sp;
                const label = sp === "dog" ? "Dog" : "Cat";
                const examples = sp === "dog" ? "Venison, Rabbit, Duck, Kangaroo, Pork, Hydrolyzed" : "Rabbit, Duck, Pork, Horse, Hydrolyzed";
                return (
                  <button
                    key={sp}
                    onClick={() => setState((p) => ({ ...p, species: sp }))}
                    className={cn(
                      "rounded-xl border-2 p-5 text-left transition-all",
                      isActive
                        ? "border-primary bg-primary/5 shadow-sm scale-[1.02]"
                        : "border-border hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    <div className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl mb-2",
                      sp === "dog" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" : "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400",
                    )}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="font-bold text-base">{label}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">{examples}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Known allergens */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in-up">
            <div>
              <h3 className="text-sm font-semibold mb-1">Known or suspected allergens</h3>
              <p className="text-xs text-muted-foreground">
                Select any food allergens confirmed or suspected for this patient. The wizard will exclude these and their cross-reactants.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {foodAllergens.map((a) => {
                const checked = state.selectedAllergens.has(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggle("allergens", a.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all flex items-start gap-2.5",
                      checked ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle("allergens", a.id)} className="mt-0.5 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{a.name}</div>
                      {a.crossReactive.length > 0 && (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 flex items-center gap-1 flex-wrap">
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                          Cross-reacts: {a.crossReactive.slice(0, 3).join(", ")}{a.crossReactive.length > 3 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {state.selectedAllergens.size === 0 && (
              <div className="rounded-lg bg-teal-500/5 border border-teal-500/20 p-3 flex items-start gap-2">
                <Info className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  No known allergens? That's OK — skip ahead. The wizard will recommend the most universally novel proteins.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Previous diets */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-in-up">
            <div>
              <h3 className="text-sm font-semibold mb-1">Proteins the pet has previously eaten</h3>
              <p className="text-xs text-muted-foreground">
                A novel protein must be one the pet has never eaten. Check all that apply — even past commercial diet proteins.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {PREVIOUS_DIET_OPTIONS.map((d) => {
                const checked = state.previousDiets.has(d.id);
                const Icon = d.icon;
                return (
                  <button
                    key={d.id}
                    onClick={() => toggle("diets", d.id)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left transition-all flex items-center gap-2",
                      checked ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-border hover:bg-muted/40",
                    )}
                  >
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-md shrink-0", checked ? "bg-amber-200 dark:bg-amber-900/50" : "bg-muted")}>
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{d.label}</div>
                      {d.common && <div className="text-[9px] text-muted-foreground">common in commercial diets</div>}
                    </div>
                    {checked && <Check className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {state.previousDiets.size === 0 && (
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Tip: most dogs have eaten chicken, beef, or lamb via standard commercial diets. Selecting these will dramatically narrow the recommendation.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-in-up">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" /> Recommended novel proteins
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {suitable.length} suitable option{suitable.length === 1 ? "" : "s"} for this {state.species} — ranked by confidence.
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] capitalize">{state.species}</Badge>
                <Badge variant="outline" className="text-[10px]">{state.selectedAllergens.size} allergen{state.selectedAllergens.size === 1 ? "" : "s"}</Badge>
                <Badge variant="outline" className="text-[10px]">{state.previousDiets.size} past diet{state.previousDiets.size === 1 ? "" : "s"}</Badge>
              </div>
            </div>

            {suitable.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-800 p-6 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-sm font-semibold">No suitable novel protein found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  With this allergen profile, a <strong>hydrolyzed diet</strong> is your best option — peptides are too small to trigger immune response regardless of prior exposures.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recommendations.map((r, idx) => {
                  const Icon = PROTEIN_ICONS[r.protein] ?? Beaker;
                  return (
                    <div
                      key={r.protein}
                      className={cn(
                        "rounded-xl border p-3 transition-all",
                        r.suitable
                          ? r.confidence === "high"
                            ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                            : "border-teal-300 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20"
                          : "border-muted bg-muted/20 opacity-70",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                          r.suitable
                            ? r.confidence === "high"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400"
                              : "bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-400"
                            : "bg-muted text-muted-foreground",
                        )}>
                          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{r.protein}</span>
                            {r.suitable ? (
                              <>
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-400 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50">
                                  <Check className="h-2.5 w-2.5 mr-0.5" /> Recommended
                                </Badge>
                                {r.confidence === "high" && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary text-primary">
                                    <Sparkles className="h-2.5 w-2.5 mr-0.5" /> High confidence
                                  </Badge>
                                )}
                                {idx === 0 && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-700 dark:border-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50">
                                    Best match
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50">
                                <X className="h-2.5 w-2.5 mr-0.5" /> Excluded
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs mt-1 leading-relaxed text-foreground/80">{r.reason}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 italic">{r.notes}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Next steps card */}
            <Separator />
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <div className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                <ClipboardCheck className="h-3.5 w-3.5 text-primary" /> Next steps
              </div>
              <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal pl-4">
                <li>Choose one of the recommended proteins as the elimination diet base.</li>
                <li>Transition over 5-7 days (25% → 50% → 75% → 100%) to prevent GI upset.</li>
                <li>Feed exclusively for 8-12 weeks; document any dietary indiscretions.</li>
                <li>Score pruritus weekly (VAS 1-10); photograph lesions every 2 weeks.</li>
                <li>If VAS improves ≥50%, rechallenge with original diet to confirm food allergy.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-8 bg-primary" : i < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          {step < TOTAL_STEPS - 1 ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
              disabled={step === 0 && !state.species}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> Start over
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
