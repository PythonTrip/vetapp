"use client";

import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  appointmentsApi,
  assessmentsApi,
  attachmentsApi,
  clientsApi,
  communicationsApi,
  clinicalCatalogApi,
  encounterTemplatesApi,
  dietPlansApi,
  encountersApi,
  foodsApi,
  guidelinesApi,
  nutrientsApi,
  patientsApi,
  type AppointmentWrite,
  type AttachmentPatch,
  type ClientWrite,
  type CommunicationWrite,
  type ClinicalCatalogItemWrite,
  type AssessmentAnimal,
  type AssessmentRecord,
  type AssessmentRequestPayload,
  type EnergyEstimateRecord,
  type EnergyEstimateRequestPayload,
  type DietPlanWrite,
  type EncounterWrite,
  type EncounterTemplateWrite,
  type FoodCategoryPair,
  type FoodMatrixParams,
  type FoodNutrientValueWrite,
  type FoodType,
  type FoodWrite,
  type PatientPatch,
  type PatientWrite,
} from "@/lib/api-client";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 1;
}

export function useClientsQuery(q: string) {
  return useQuery({
    queryKey: ["clients", q],
    queryFn: () => clientsApi.list(q),
    retry: retryUnlessClientError,
  });
}

export function usePatientsQuery(q: string, enabled = true) {
  return useQuery({
    queryKey: ["patients", q],
    queryFn: () => patientsApi.list(q),
    enabled,
    retry: retryUnlessClientError,
  });
}

export function usePatientQuery(id: string) {
  return useQuery({
    queryKey: ["patient", id],
    queryFn: () => patientsApi.get(id),
    enabled: id.length > 0,
    retry: retryUnlessClientError,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ClientWrite) => clientsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClientWrite }) => clientsApi.update(id, body),
    onSuccess: (client) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      void queryClient.invalidateQueries({ queryKey: ["patient"] });
      queryClient.setQueryData(["client", client.uuid], client);
    },
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatientWrite) => patientsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PatientPatch }) => patientsApi.update(id, body),
    onSuccess: (patient) => {
      queryClient.setQueryData(["patient", patient.uuid], patient);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useFoodsQuery(
  q: string,
  type?: FoodType,
  categoryPairs: FoodCategoryPair[] = [],
  enabled = true,
) {
  return useQuery({
    queryKey: ["foods", q, type ?? "all", categoryPairs],
    queryFn: () => foodsApi.list(q, type, categoryPairs),
    enabled,
    retry: retryUnlessClientError,
  });
}

export function useFoodCategoriesQuery() {
  return useQuery({
    queryKey: ["food-categories"],
    queryFn: () => foodsApi.categories(),
    retry: retryUnlessClientError,
  });
}

export function useFoodMatrixQuery(
  options: Omit<FoodMatrixParams, "offset" | "limit">,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: [
      "food-matrix",
      options.q,
      options.categoryPairs,
      options.nutrientCategory,
      options.sort,
      options.sortDir,
    ],
    queryFn: ({ pageParam }) => foodsApi.matrix({
      ...options,
      offset: pageParam,
      limit: 50,
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 5 * 60 * 1000,
    enabled,
    retry: retryUnlessClientError,
  });
}

export function useFoodQuery(id: string | null) {
  return useQuery({
    queryKey: ["food", id],
    queryFn: () => foodsApi.get(id ?? ""),
    enabled: Boolean(id),
    retry: retryUnlessClientError,
  });
}

export function useNutrientsQuery() {
  return useQuery({
    queryKey: ["nutrients"],
    queryFn: () => nutrientsApi.list(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: retryUnlessClientError,
  });
}

export function useCreateFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FoodWrite) => foodsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["foods"] });
      void queryClient.invalidateQueries({ queryKey: ["food-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["food-matrix"] });
    },
  });
}

export function useUpdateFood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<FoodWrite> }) =>
      foodsApi.update(id, body),
    onSuccess: (food) => {
      queryClient.setQueryData(["food", food.uuid], food);
      void queryClient.invalidateQueries({ queryKey: ["foods"] });
      void queryClient.invalidateQueries({ queryKey: ["food-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["food-matrix"] });
    },
  });
}

export function useReplaceFoodNutrients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: FoodNutrientValueWrite[] }) =>
      foodsApi.replaceNutrients(id, body),
    onSuccess: (food) => {
      queryClient.setQueryData(["food", food.uuid], food);
      void queryClient.invalidateQueries({ queryKey: ["foods"] });
      void queryClient.invalidateQueries({ queryKey: ["food-matrix"] });
    },
  });
}

export function useActiveGuidelineQuery(enabled = true) {
  return useQuery({
    queryKey: ["guidelines", "active"],
    queryFn: () => guidelinesApi.active(),
    staleTime: 5 * 60 * 1000,
    enabled,
    retry: retryUnlessClientError,
  });
}

export function useGuidelineContextOptions(species: "dog" | "cat" | null) {
  return useQuery({
    queryKey: ["guidelines", "context-options", species],
    queryFn: () => guidelinesApi.contextOptions(species ?? "dog"),
    enabled: species !== null,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessClientError,
  });
}

export function useAssessmentSuggestions(animal: AssessmentAnimal | null) {
  return useQuery({
    queryKey: ["assessment-suggestions", animal],
    queryFn: () => assessmentsApi.suggestions(animal as AssessmentAnimal),
    enabled: animal !== null,
    retry: retryUnlessClientError,
  });
}


export function useEnergyEstimate(request: EnergyEstimateRequestPayload | null) {
  const requestKey = request ? JSON.stringify(request) : "";
  const debouncedRequestKey = useDebouncedValue(requestKey, 400);
  const latestInputKey = useRef(requestKey);
  const latestToken = useRef(0);
  const [data, setData] = useState<EnergyEstimateRecord | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isPending, setIsPending] = useState(Boolean(request));

  useEffect(() => {
    latestInputKey.current = requestKey;
    latestToken.current += 1;
    setData(null);
    setError(null);
    setIsPending(Boolean(requestKey));
  }, [requestKey]);

  useEffect(() => {
    if (!debouncedRequestKey) {
      setIsPending(false);
      return;
    }
    const token = ++latestToken.current;
    const sentKey = debouncedRequestKey;
    const payload = JSON.parse(sentKey) as EnergyEstimateRequestPayload;
    void assessmentsApi.energyEstimate(payload).then(
      (result) => {
        if (token !== latestToken.current || sentKey !== latestInputKey.current) return;
        setData(result);
        setError(null);
        setIsPending(false);
      },
      (cause: unknown) => {
        if (token !== latestToken.current || sentKey !== latestInputKey.current) return;
        setData(null);
        setError(cause);
        setIsPending(false);
      },
    );
  }, [debouncedRequestKey]);

  return { data, error, isPending };
}


export function useFoodEnergyValues(foodIds: string[]) {
  const results = useQueries({
    queries: foodIds.map((id) => ({
      queryKey: ["food", id],
      queryFn: () => foodsApi.get(id),
      retry: retryUnlessClientError,
    })),
  });
  const data: Record<string, number | null> = {};
  results.forEach((result, index) => {
    const value = result.data?.nutrient_values.find(
      (item) => item.code === "ME" && item.basis === "per_100g_as_fed",
    );
    data[foodIds[index]] = value?.value_status === "unknown" ? null : (value?.value ?? null);
  });
  return {
    data,
    foods: Object.fromEntries(
      results.map((result, index) => [foodIds[index], result.data]),
    ),
    isPending: results.some((result) => result.isPending),
  };
}


export function useCreateAssessment() {
  const latestSequence = useRef(0);
  const [data, setData] = useState<AssessmentRecord | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(async (
    body: AssessmentRequestPayload,
  ): Promise<AssessmentRecord | null> => {
    const sequence = ++latestSequence.current;
    setIsPending(true);
    setError(null);
    try {
      const result = await assessmentsApi.create(body);
      if (sequence !== latestSequence.current) return null;
      setData(result);
      setIsPending(false);
      return result;
    } catch (cause) {
      if (sequence !== latestSequence.current) return null;
      setError(cause);
      setIsPending(false);
      throw cause;
    }
  }, []);

  const reset = useCallback(() => {
    latestSequence.current += 1;
    setData(null);
    setError(null);
    setIsPending(false);
  }, []);

  return { data, error, isPending, mutateAsync, reset };
}

export function useDietPlansQuery(patientId?: string) {
  return useQuery({
    queryKey: ["diet-plans", patientId ?? "recent"],
    queryFn: () => dietPlansApi.list(patientId),
    retry: retryUnlessClientError,
  });
}

export function useDietPlanQuery(id: string) {
  return useQuery({
    queryKey: ["diet-plan", id],
    queryFn: () => dietPlansApi.get(id),
    enabled: id.length > 0,
    retry: retryUnlessClientError,
  });
}

export function useCreateDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DietPlanWrite) => dietPlansApi.create(body),
    onSuccess: (plan) => {
      queryClient.setQueryData(["diet-plan", plan.uuid], plan);
      void queryClient.invalidateQueries({ queryKey: ["diet-plans"] });
    },
  });
}

export function useUpdateDietPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DietPlanWrite }) =>
      dietPlansApi.update(id, body),
    onSuccess: (plan) => {
      queryClient.setQueryData(["diet-plan", plan.uuid], plan);
      void queryClient.invalidateQueries({ queryKey: ["diet-plans"] });
    },
  });
}

export function useEncountersQuery(patientId: string) {
  return useQuery({
    queryKey: ["encounters", patientId],
    queryFn: () => encountersApi.list(patientId),
    enabled: patientId.length > 0,
    retry: retryUnlessClientError,
  });
}

export function useCreateEncounter(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EncounterWrite) => encountersApi.create(patientId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["encounters", patientId] });
    },
  });
}

export function useUpdateEncounter(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EncounterWrite> }) =>
      encountersApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["encounters", patientId] });
    },
  });
}

export function useDeleteEncounter(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => encountersApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["encounters", patientId] });
      void queryClient.invalidateQueries({ queryKey: ["attachments", patientId] });
    },
  });
}

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

export function useAttachmentsQuery(patientId: string) {
  return useQuery({
    queryKey: ["attachments", patientId],
    queryFn: () => attachmentsApi.list(patientId),
    enabled: patientId.length > 0,
    retry: retryUnlessClientError,
  });
}

export function useUploadAttachment(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FormData) => attachmentsApi.upload(patientId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attachments", patientId] });
    },
  });
}

export function useUpdateAttachment(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AttachmentPatch }) => attachmentsApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attachments", patientId] });
    },
  });
}

export function useDeleteAttachment(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attachmentsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["attachments", patientId] });
    },
  });
}

export function useAppointmentsQuery(params?: { patientId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["appointments", params?.patientId ?? "all", params?.from ?? "", params?.to ?? ""],
    queryFn: () => appointmentsApi.list(params),
    retry: retryUnlessClientError,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AppointmentWrite) => appointmentsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AppointmentWrite> }) =>
      appointmentsApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => appointmentsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useCommunicationsQuery(patientId: string) {
  return useQuery({
    queryKey: ["communications", patientId],
    queryFn: () => communicationsApi.list(patientId),
    enabled: patientId.length > 0,
    retry: retryUnlessClientError,
  });
}

export function useCreateCommunication(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CommunicationWrite) => communicationsApi.create(patientId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["communications", patientId] });
    },
  });
}

export function useUpdateCommunication(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CommunicationWrite> }) =>
      communicationsApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["communications", patientId] });
    },
  });
}

export function useDeleteCommunication(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communicationsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["communications", patientId] });
    },
  });
}
