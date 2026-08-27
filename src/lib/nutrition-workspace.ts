"use client";

// Shared workspace state for the Nutritionist Assistant module.
// Links the nutrition tools together: the product catalog can push data into
// the Dry Matter converter and the Diet Builder, and a single selected patient
// drives prefill + one-click saving everywhere. Diet Builder state lives here
// (not in the component) so it survives tab switches — Radix Tabs unmount
// inactive content.

import { create } from "zustand";
import type { DietTemplateComponent, DietType } from "@/lib/types";
import type { FediafAnimalProfile, FediafSelectionSuggestion } from "@/lib/fediaf";

export type NutritionTab = "catalog" | "rer-mer" | "dm" | "template";

export interface DryMatterPrefill {
  productId: number;
  productName: string;
  protein: number; // as-fed %
  fat: number;
  fiber: number;
  moisture: number;
  meKcalPerKg: number | null; // catalog ME for comparison with the estimate
}

export interface FediafDraftSelection {
  stageCode: string | null;
  formulaCode: string | null;
  sizeClassCode: string | null;
}

interface NutritionWorkspaceState {
  activeTab: NutritionTab;
  setActiveTab: (tab: NutritionTab) => void;

  // Shared patient context: prefills the calculator, enables one-click saves
  patientId: string | null;
  setPatientId: (id: string | null) => void;

  // Explicit clinician gate for the current Nutrition working session.
  // This is intentionally not inferred from specialty or diagnoses.
  therapeuticGoal: boolean;
  setTherapeuticGoal: (therapeuticGoal: boolean) => void;

  // Clinical FEDIAF flow. Suggestions and draft overrides are deliberately
  // separate from confirmed values so profile changes can never silently
  // change the norms or MER used downstream.
  fediafProfile: FediafAnimalProfile;
  fediafSuggestion: FediafSelectionSuggestion | null;
  fediafDraft: FediafDraftSelection;
  confirmedStageCode: string | null;
  confirmedFormulaCode: string | null;
  confirmedSizeClassCode: string | null;
  stageConfirmed: boolean;
  setFediafProfile: (patch: Partial<FediafAnimalProfile>) => void;
  replaceFediafProfile: (profile: FediafAnimalProfile) => void;
  applyFediafSuggestion: (suggestion: FediafSelectionSuggestion) => void;
  setFediafDraft: (patch: Partial<FediafDraftSelection>) => void;
  confirmFediafSelection: () => void;
  dismissFediafSelection: () => void;

  // Product handed from the catalog to the Dry Matter converter
  dmPrefill: DryMatterPrefill | null;
  sendProductToDryMatter: (prefill: DryMatterPrefill) => void;
  clearDmPrefill: () => void;

  // Diet Builder state (persists across tab switches)
  dietType: DietType;
  setDietType: (type: DietType) => void;
  components: DietTemplateComponent[];
  updateDietComponent: (
    index: number,
    patch: Partial<Pick<DietTemplateComponent, "category" | "grams">>
  ) => void;
  removeDietComponent: (index: number) => void;
  /** Returns false if this catalog product is already in the ration. */
  addProductToDiet: (component: DietTemplateComponent) => boolean;

}

export const useNutritionWorkspace = create<NutritionWorkspaceState>((set, get) => ({
  activeTab: "catalog",
  setActiveTab: (tab) => set({ activeTab: tab }),

  patientId: null,
  setPatientId: (id) => set({
    patientId: id,
    fediafSuggestion: null,
    fediafDraft: { stageCode: null, formulaCode: null, sizeClassCode: null },
    confirmedStageCode: null,
    confirmedFormulaCode: null,
    confirmedSizeClassCode: null,
    stageConfirmed: false,
  }),
  therapeuticGoal: false,
  setTherapeuticGoal: (therapeuticGoal) => set({ therapeuticGoal }),

  fediafProfile: {
    species: "dog",
    breedCode: "",
    currentBodyWeightKg: null,
    expectedAdultWeightKg: null,
    ageWeeks: null,
    ageMonths: null,
    lifeStage: "adult",
    activity: "moderate",
    neutered: true,
    pregnant: false,
    lactating: false,
    lactationWeek: null,
    litterSize: null,
    maintenanceEnergyKcalDay: null,
  },
  fediafSuggestion: null,
  fediafDraft: { stageCode: null, formulaCode: null, sizeClassCode: null },
  confirmedStageCode: null,
  confirmedFormulaCode: null,
  confirmedSizeClassCode: null,
  stageConfirmed: false,
  setFediafProfile: (patch) => set((state) => ({
    fediafProfile: { ...state.fediafProfile, ...patch },
    stageConfirmed: false,
    confirmedStageCode: null,
    confirmedFormulaCode: null,
    confirmedSizeClassCode: null,
  })),
  replaceFediafProfile: (profile) => set({
    fediafProfile: profile,
    fediafSuggestion: null,
    fediafDraft: { stageCode: null, formulaCode: null, sizeClassCode: null },
    stageConfirmed: false,
    confirmedStageCode: null,
    confirmedFormulaCode: null,
    confirmedSizeClassCode: null,
  }),
  applyFediafSuggestion: (suggestion) => set({
    fediafSuggestion: suggestion,
    fediafDraft: {
      stageCode: suggestion.stageCode,
      formulaCode: suggestion.formulaCode,
      sizeClassCode: suggestion.sizeClassCode,
    },
    stageConfirmed: false,
    confirmedStageCode: null,
    confirmedFormulaCode: null,
    confirmedSizeClassCode: null,
  }),
  setFediafDraft: (patch) => set((state) => ({
    fediafDraft: { ...state.fediafDraft, ...patch },
    stageConfirmed: false,
    confirmedStageCode: null,
    confirmedFormulaCode: null,
    confirmedSizeClassCode: null,
  })),
  confirmFediafSelection: () => set((state) => ({
    stageConfirmed: Boolean(state.fediafDraft.stageCode && state.fediafDraft.formulaCode),
    confirmedStageCode: state.fediafDraft.stageCode,
    confirmedFormulaCode: state.fediafDraft.formulaCode,
    confirmedSizeClassCode: state.fediafDraft.sizeClassCode,
  })),
  dismissFediafSelection: () => set({
    fediafDraft: { stageCode: null, formulaCode: null, sizeClassCode: null },
    stageConfirmed: false,
    confirmedStageCode: null,
    confirmedFormulaCode: null,
    confirmedSizeClassCode: null,
  }),

  dmPrefill: null,
  sendProductToDryMatter: (prefill) => set({ dmPrefill: prefill, activeTab: "dm" }),
  clearDmPrefill: () => set({ dmPrefill: null }),

  dietType: "barf",
  setDietType: (type) => set({ dietType: type }),
  components: [],
  updateDietComponent: (index, patch) =>
    set((state) => ({
      components: state.components.map((component, componentIndex) =>
        componentIndex === index ? { ...component, ...patch } : component
      ),
    })),
  removeDietComponent: (index) =>
    set((state) => ({
      components: state.components.filter((_, componentIndex) => componentIndex !== index),
    })),
  addProductToDiet: (component) => {
    const { components } = get();
    if (component.productId != null && components.some((c) => c.productId === component.productId)) {
      return false;
    }
    set({ components: [...components, { ...component, grams: 0 }] });
    return true;
  },
}));
