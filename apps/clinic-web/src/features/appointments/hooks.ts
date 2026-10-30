"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi, type AppointmentWrite, type AppointmentPatch } from "@/features/appointments/api";
import { retryUnlessClientError } from "@/shared/api/query";

export function useAppointmentsQuery(params?: { patientId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["appointments", params?.patientId ?? "all", params?.from ?? "", params?.to ?? ""],
    queryFn: () => appointmentsApi.list(params),
    retry: retryUnlessClientError,
  });
}

export function useAppointmentQuery(id: string) {
  return useQuery({
    queryKey: ["appointment", id],
    queryFn: () => appointmentsApi.get(id),
    enabled: id.length > 0,
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
    mutationFn: ({ id, body }: { id: string; body: AppointmentPatch }) =>
      appointmentsApi.update(id, body),
    onSuccess: (appointment) => {
      queryClient.setQueryData(["appointment", appointment.uuid], appointment);
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
