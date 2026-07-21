"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AppointmentWithPet,
  CommunicationLogEntry,
  Consultation,
  CustomTemplate,
  DietPlan,
  LesionPhoto,
  PetWithRelations,
} from "@/lib/types";
import type { NutritionProductDto, NutritionProductsResponse } from "@/lib/nutrition-products";
import { api } from "@/lib/api-client";

const fetchPets = () => api.get<PetWithRelations[]>("/api/pets", "Failed to load pets");

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
      return api.get<NutritionProductsResponse>(
        `/api/nutrition-products?${params}`,
        "Не удалось загрузить каталог продуктов",
      );
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
      const data = await api.get<{ products: NutritionProductDto[] }>(
        `/api/nutrition-products?q=${encodeURIComponent(q)}`,
        "Не удалось выполнить поиск по каталогу",
      );
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
      const data = await api.get<{ products: NutritionProductDto[] }>(
        `/api/nutrition-products?ids=${sorted.join(",")}`,
        "Не удалось загрузить продукты каталога",
      );
      return data.products;
    },
    enabled: sorted.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useCreatePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<PetWithRelations>("/api/pets", data, "Failed to create pet"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useUpdatePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch<PetWithRelations>(`/api/pets/${id}`, data, "Failed to update pet"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeletePet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/pets/${id}`, "Failed to delete pet"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useAddConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ petId, data }: { petId: string; data: Record<string, unknown> }) =>
      api.post<Consultation>(`/api/pets/${petId}/consultations`, data, "Failed to add consultation"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeleteConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/consultations/${id}`, "Failed to delete consultation"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useUpdateConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch<Consultation>(`/api/consultations/${id}`, data, "Failed to update consultation"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useAddPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ petId, data }: { petId: string; data: Record<string, unknown> }) =>
      api.post<LesionPhoto>(`/api/pets/${petId}/photos`, data, "Failed to add photo"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/photos/${id}`, "Failed to delete photo"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useCreateDietPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<DietPlan>("/api/diet-plans", data, "Failed to save diet plan"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

export function useDeleteDietPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/diet-plans/${id}`, "Failed to delete diet plan"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pets"] }),
  });
}

// --- Appointments ---

const fetchAppointments = () =>
  api.get<AppointmentWithPet[]>("/api/appointments", "Failed to load appointments");

export function useAppointments() {
  return useQuery({
    queryKey: ["appointments"],
    queryFn: fetchAppointments,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<AppointmentWithPet>("/api/appointments", data, "Failed to create appointment"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch<AppointmentWithPet>(`/api/appointments/${id}`, data, "Failed to update appointment"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

export function useDeleteAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/appointments/${id}`, "Failed to delete appointment"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["pets"] });
    },
  });
}

// --- Custom Treatment Templates ---

const fetchCustomTemplates = () =>
  api.get<CustomTemplate[]>("/api/custom-templates", "Failed to load custom templates");

export function useCustomTemplates() {
  return useQuery({
    queryKey: ["custom-templates"],
    queryFn: fetchCustomTemplates,
  });
}

export function useCreateCustomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<CustomTemplate>("/api/custom-templates", data, "Failed to create template"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-templates"] }),
  });
}

export function useUpdateCustomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch<CustomTemplate>(`/api/custom-templates/${id}`, data, "Failed to update template"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-templates"] }),
  });
}

export function useDeleteCustomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/custom-templates/${id}`, "Failed to delete template"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-templates"] }),
  });
}

// --- Communications Log (per-pet, persisted) ---
export function useCommunications(petId: string | null) {
  return useQuery({
    queryKey: ["communications", petId],
    queryFn: () => api.get<CommunicationLogEntry[]>(
      `/api/communications?petId=${encodeURIComponent(petId ?? "")}`,
      "Failed to load communications",
    ),
    enabled: !!petId,
  });
}

export function useCreateCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<CommunicationLogEntry>("/api/communications", data, "Failed to log communication"),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["communications", vars.petId] });
    },
  });
}

export function useUpdateCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; petId: string; data: Record<string, unknown> }) =>
      api.patch<CommunicationLogEntry>(`/api/communications/${id}`, data, "Failed to update communication"),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["communications", vars.petId] });
    },
  });
}

export function useDeleteCommunication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; petId: string }) =>
      api.delete(`/api/communications/${id}`, "Failed to delete communication"),
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
    queryFn: () => api.get<ShareTokenInfo[]>(
      `/api/share-tokens?petId=${encodeURIComponent(petId ?? "")}`,
      "Failed to load share tokens",
    ),
    enabled: !!petId,
  });
}

export function useCreateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { petId: string; expiresInDays?: number; label?: string }) =>
      api.post<ShareTokenInfo>("/api/share-tokens", data, "Failed to create share token"),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["share-tokens", vars.petId] });
    },
  });
}

export function useRevokeShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; petId: string }) =>
      api.patch(`/api/share-tokens/${id}`, { revoked: true }, "Failed to revoke"),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["share-tokens", vars.petId] });
    },
  });
}

export function useDeleteShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; petId: string }) =>
      api.delete(`/api/share-tokens/${id}`, "Failed to delete"),
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
    queryFn: () => api.get<CustomHandoutInfo[]>(
      "/api/custom-handouts",
      "Failed to load custom handouts",
    ),
  });
}

export function useCreateCustomHandout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<CustomHandoutInfo>("/api/custom-handouts", data, "Failed to create handout"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-handouts"] }),
  });
}

export function useUpdateCustomHandout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch<CustomHandoutInfo>(`/api/custom-handouts/${id}`, data, "Failed to update handout"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-handouts"] }),
  });
}

export function useDeleteCustomHandout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/custom-handouts/${id}`, "Failed to delete handout"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-handouts"] }),
  });
}
