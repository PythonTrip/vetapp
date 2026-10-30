"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientsApi, patientsApi, type ClientWrite, type PatientPatch, type PatientWrite } from "@/features/patients/api";
import { retryUnlessClientError } from "@/shared/api/query";

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
