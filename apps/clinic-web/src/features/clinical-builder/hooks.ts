"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clinicalCatalogApi, encounterTemplatesApi, type ClinicalCatalogItemWrite, type EncounterTemplateWrite } from "@/features/clinical-builder/api";
import { retryUnlessClientError } from "@/shared/api/query";

export function useEncounterTemplatesQuery(doctorName?: string) {
  return useQuery({
    queryKey: ["encounter-templates", doctorName?.trim() ?? ""],
    queryFn: () => encounterTemplatesApi.list(doctorName),
    retry: retryUnlessClientError,
  });
}

export function useCreateEncounterTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EncounterTemplateWrite) => encounterTemplatesApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["encounter-templates"] });
    },
  });
}

export function useUpdateEncounterTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EncounterTemplateWrite> }) =>
      encounterTemplatesApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["encounter-templates"] });
    },
  });
}

export function useDeleteEncounterTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => encounterTemplatesApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["encounter-templates"] });
    },
  });
}

export function useClinicalCatalogQuery(doctorName?: string) {
  return useQuery({
    queryKey: ["clinical-catalog", doctorName?.trim() ?? ""],
    queryFn: () => clinicalCatalogApi.list(doctorName),
    retry: retryUnlessClientError,
  });
}

export function useCreateClinicalCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ClinicalCatalogItemWrite) => clinicalCatalogApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clinical-catalog"] });
    },
  });
}

export function useUpdateClinicalCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<ClinicalCatalogItemWrite> }) =>
      clinicalCatalogApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clinical-catalog"] });
    },
  });
}

export function useDeleteClinicalCatalogItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clinicalCatalogApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clinical-catalog"] });
    },
  });
}
