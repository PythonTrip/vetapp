import type { components } from "@vetdietderm/api-contract";
import { apiRequest, apiBlob } from "@/shared/api/client";

type Schemas = components["schemas"];

export type AnimalPassport = Schemas["AnimalRead"];
export type OwnerVisit = Schemas["VisitRead"];
export type VisitFile = Schemas["VisitFileRead"];
export type PendingRegistration = Schemas["RegistrationRead"];
export type RegistrationAccept = Schemas["RegistrationAccept"];
export type StaffVisit = Schemas["StaffVisitRead"];
export type VisitConfirm = Schemas["VisitConfirm"];

export function ownerError(cause: unknown): string {
  if (cause instanceof Error && /Failed to fetch|NetworkError|API unavailable|fetch failed|Load failed/i.test(cause.message)) {
    return "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.";
  }
  return cause instanceof Error ? cause.message : "Не удалось выполнить запрос";
}

export function visitAnswerLabel(answer: OwnerVisit["answers"][number]): string {
  if (answer.kind === "binary") return answer.value === "yes" ? "Да" : "Нет";
  if (answer.kind === "date" && typeof answer.value === "string") return answer.value.split("-").reverse().join(".");
  const values = Array.isArray(answer.value) ? answer.value : [answer.value];
  return values
    .map(value => answer.options?.find(option => option.value === value)?.label ?? String(value))
    .join(", ");
}

export const registrationsApi = {
  list: () => apiRequest<PendingRegistration[]>("/owner-registrations"),
  patients: (id: string, clientId: string) =>
    apiRequest<AnimalPassport[]>(`/owner-registrations/${id}/patients?client_uuid=${encodeURIComponent(clientId)}`),
  accept: (id: string, body: RegistrationAccept) =>
    apiRequest<Schemas["RegistrationAccepted"]>(`/owner-registrations/${id}/accept`, { method: "POST", body }),
};

export const visitRequestsApi = {
  list: () => apiRequest<StaffVisit[]>("/visit-requests?status=requested"),
  confirm: (id: string, body: VisitConfirm) =>
    apiRequest<OwnerVisit>(`/visit-requests/${id}/confirm`, { method: "POST", body }),
  reject: (id: string, reason: string) =>
    apiRequest<OwnerVisit>(`/visit-requests/${id}/reject`, { method: "POST", body: { reason: reason.trim() || null } }),
  download: (id: string, fileId: string) => apiBlob(`/visit-requests/${id}/files/${fileId}`, "Не удалось скачать файл"),
};
