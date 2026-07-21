"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PetWithRelations } from "@/lib/types";
import type { NutritionProductDto, NutritionProductsResponse } from "@/lib/nutrition-products";

async function fetchPets() {
  const res = await fetch("/api/pets");
  if (!res.ok) throw new Error("Failed to load pets");
  return res.json() as Promise<PetWithRelations[]>;
}

export function usePets() {
  return useQuery({
    queryKey: ["pets"],
    queryFn: fetchPets,
  });
}

export function useNutritionProducts(
  category: string,
  subcategory: string,
  search: string,
  page: number,
  sortBy: string,
  sortDirection: string,
) {
  return useQuery({
    queryKey: ["nutrition-products", category, subcategory, search, page, sortBy, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams({
        category,
        page: String(page),
        sortBy,
        sortDirection,
      });
      if (subcategory !== "all") params.set("subcategory", subcategory);
      if (search) params.set("search", search);
      const res = await fetch(`/api/nutrition-products?${params}`);
      if (!res.ok) throw new Error("Не удалось загрузить каталог продуктов");
      return res.json() as Promise<NutritionProductsResponse>;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 60_000,
  });
}

// Global product search across all catalog categories (Diet Builder inline search)
export function useNutritionProductSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["nutrition-product-search", q],
    queryFn: async () => {
      const res = await fetch(`/api/nutrition-products?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Не удалось выполнить поиск по каталогу");
      const data = (await res.json()) as { products: NutritionProductDto[] };
      return data.products;
    },
    enabled: q.length >= 2,
    placeholderData: (previousData) => previousData,
    staleTime: 60_000,
  });
}

// Full product records for linked diet components (nutrient analysis)
export function useNutritionProductsByIds(ids: number[]) {
  const sorted = [...ids].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["nutrition-products-by-ids", sorted.join(",")],
    queryFn: async () => {
      const res = await fetch(`/api/nutrition-products?ids=${sorted.join(",")}`);
      if (!res.ok) throw new Error("Не удалось загрузить продукты каталога");
      const data = (await res.json()) as { products: NutritionProductDto[] };
      return data.products;
    },
    enabled: sorted.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useCreatePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/pets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create pet");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useUpdatePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/pets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update pet");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeletePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete pet");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useAddConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ petId, data }: { petId: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/pets/${petId}/consultations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add consultation");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeleteConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/consultations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete consultation");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useUpdateConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/consultations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update consultation");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useAddPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ petId, data }: { petId: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/pets/${petId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add photo");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete photo");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useCreateDietPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/diet-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save diet plan");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeleteDietPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/diet-plans/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete diet plan");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

// --- Appointments ---
import type { AppointmentWithPet } from "@/lib/types";

async function fetchAppointments() {
  const res = await fetch("/api/appointments");
  if (!res.ok) throw new Error("Failed to load appointments");
  return res.json() as Promise<AppointmentWithPet[]>;
}

export function useAppointments() {
  return useQuery({
    queryKey: ["appointments"],
    queryFn: fetchAppointments,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create appointment");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update appointment");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete appointment");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

// --- Custom Treatment Templates ---
import type { CustomTemplate, CommunicationLogEntry } from "@/lib/types";

async function fetchCustomTemplates() {
  const res = await fetch("/api/custom-templates");
  if (!res.ok) throw new Error("Failed to load custom templates");
  return res.json() as Promise<CustomTemplate[]>;
}

export function useCustomTemplates() {
  return useQuery({
    queryKey: ["custom-templates"],
    queryFn: fetchCustomTemplates,
  });
}

export function useCreateCustomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/custom-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-templates"] }),
  });
}

export function useUpdateCustomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/custom-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update template");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-templates"] }),
  });
}

export function useDeleteCustomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/custom-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-templates"] }),
  });
}

// --- Communications Log (per-pet, persisted) ---
export function useCommunications(petId: string | null) {
  return useQuery({
    queryKey: ["communications", petId],
    queryFn: async () => {
      const res = await fetch(`/api/communications?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to load communications");
      return res.json() as Promise<CommunicationLogEntry[]>;
    },
    enabled: !!petId,
  });
}

export function useCreateCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to log communication");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["communications", vars.petId] });
    },
  });
}

export function useUpdateCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, petId, data }: { id: string; petId: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/communications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update communication");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["communications", vars.petId] });
    },
  });
}

export function useDeleteCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, petId }: { id: string; petId: string }) => {
      const res = await fetch(`/api/communications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete communication");
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["communications", vars.petId] });
    },
  });
}

// --- Share Tokens (owner portal) ---
export interface ShareTokenInfo {
  id: string;
  token: string;
  petId: string;
  label: string | null;
  expiresAt: string;
  viewedAt: string | null;
  viewCount: number;
  revoked: boolean;
  createdAt: string;
}

export function useShareTokens(petId: string | null) {
  return useQuery({
    queryKey: ["share-tokens", petId],
    queryFn: async () => {
      const res = await fetch(`/api/share-tokens?petId=${petId}`);
      if (!res.ok) throw new Error("Failed to load share tokens");
      return res.json() as Promise<ShareTokenInfo[]>;
    },
    enabled: !!petId,
  });
}

export function useCreateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { petId: string; expiresInDays?: number; label?: string }) => {
      const res = await fetch("/api/share-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create share token");
      return res.json() as Promise<ShareTokenInfo>;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["share-tokens", vars.petId] });
    },
  });
}

export function useRevokeShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, petId }: { id: string; petId: string }) => {
      const res = await fetch(`/api/share-tokens/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: true }),
      });
      if (!res.ok) throw new Error("Failed to revoke");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["share-tokens", vars.petId] });
    },
  });
}

export function useDeleteShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, petId }: { id: string; petId: string }) => {
      const res = await fetch(`/api/share-tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["share-tokens", vars.petId] });
    },
  });
}

// --- Custom Handout Templates ---
export interface CustomHandoutInfo {
  id: string;
  title: string;
  description: string | null;
  prompt: string;
  category: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export function useCustomHandouts() {
  return useQuery({
    queryKey: ["custom-handouts"],
    queryFn: async () => {
      const res = await fetch("/api/custom-handouts");
      if (!res.ok) throw new Error("Failed to load custom handouts");
      return res.json() as Promise<CustomHandoutInfo[]>;
    },
  });
}

export function useCreateCustomHandout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch("/api/custom-handouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create handout");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-handouts"] }),
  });
}

export function useUpdateCustomHandout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await fetch(`/api/custom-handouts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update handout");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-handouts"] }),
  });
}

export function useDeleteCustomHandout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/custom-handouts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete handout");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-handouts"] }),
  });
}
