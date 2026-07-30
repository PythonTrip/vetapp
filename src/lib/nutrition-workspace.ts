"use client";

// Shared workspace state for the Nutritionist Assistant module.
// Links the nutrition tools together: the product catalog can push data into
// the Dry Matter converter and the Diet Builder, and a single selected patient
// drives prefill + one-click saving everywhere. Diet Builder state lives here
// (not in the component) so it survives tab switches — Radix Tabs unmount
// inactive content.

import { create } from "zustand";
import type { DietTemplateComponent, DietType } from "@/lib/types";
import type { NormStandard } from "@/lib/nutrition-analysis";

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

interface NutritionWorkspaceState {
  activeTab: NutritionTab;
  setActiveTab: (tab: NutritionTab) => void;

  // Shared patient context: prefills the calculator, enables one-click saves
  patientId: string | null;
  setPatientId: (id: string | null) => void;

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

  // Nutrient-analysis reference standard (persists across tab switches).
  // `null` stage = follow the selected patient's life stage automatically.
  normStandard: NormStandard;
  setNormStandard: (standard: NormStandard) => void;
  normStage: string | null;
  setNormStage: (stage: string | null) => void;
}

export const useNutritionWorkspace = create<NutritionWorkspaceState>((set, get) => ({
  activeTab: "catalog",
  setActiveTab: (tab) => set({ activeTab: tab }),

  patientId: null,
  setPatientId: (id) => set({ patientId: id }),

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

  normStandard: "fediaf2025",
  setNormStandard: (standard) => set({ normStandard: standard }),
  normStage: null,
  setNormStage: (stage) => set({ normStage: stage }),
}));
