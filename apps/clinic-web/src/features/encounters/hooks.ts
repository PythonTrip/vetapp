"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attachmentsApi, communicationsApi, encountersApi, type AttachmentPatch, type CommunicationWrite, type EncounterWrite } from "@/features/encounters/api";
import { retryUnlessClientError } from "@/shared/api/query";

export function useEncountersQuery(patientId: string) {
  return useQuery({
    queryKey: ["encounters", patientId],
    queryFn: () => encountersApi.list(patientId),
    enabled: patientId.length > 0,
    retry: retryUnlessClientError,
  });
}

export function useEncounterQuery(id: string) {
  return useQuery({
    queryKey: ["encounter", id],
    queryFn: () => encountersApi.get(id),
    enabled: id.length > 0,
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
