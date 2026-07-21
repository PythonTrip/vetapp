"use client";

import { create } from "zustand";

export type ModuleId = "dashboard" | "crm" | "nutrition" | "knowledge";

interface AppState {
  activeModule: ModuleId;
  activePetId: string | null;
  setActiveModule: (m: ModuleId) => void;
  setActivePetId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "dashboard",
  activePetId: null,
  setActiveModule: (m) => set({ activeModule: m }),
  setActivePetId: (id) => set({ activePetId: id }),
}));
