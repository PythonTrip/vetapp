import type { components } from "@vetdietderm/api-contract";
type Schemas = components["schemas"];

import { apiBlob, apiRequest, apiUpload } from "@/lib/api-client";
import type { BookableVisitType, VisitQuestionnaire } from "@/lib/api-client";

export type DoctorPreview = Schemas["DoctorPreview"];
export type OwnerProfile = Schemas["OwnerRead"];
export type OwnerFile = Schemas["OwnerFileRead"];
export type OwnerContact = Schemas["OwnerProfileWrite"];
export type AnimalPassport = Schemas["AnimalRead"];
export type ChatMessage = Schemas["MessageRead"];
export const chatApi = {
  list: (path: string, ownerView: boolean) => apiRequest<ChatMessage[]>(path, { authRecovery: !ownerView }),
  send: (path: string, ownerView: boolean, body: string) => apiRequest<ChatMessage>(path, { method: "POST", body: { body }, authRecovery: !ownerView }),
};
export type PendingRegistration = Schemas["RegistrationRead"];
export type RegistrationAccept = Schemas["RegistrationAccept"];
export const registrationsApi = {
  list: () => apiRequest<PendingRegistration[]>("/owner-registrations"),
  patients: (id: string, clientId: string) => apiRequest<AnimalPassport[]>(`/owner-registrations/${id}/patients?client_uuid=${encodeURIComponent(clientId)}`),
  accept: (id: string, body: RegistrationAccept) => apiRequest<Schemas["RegistrationAccepted"]>(`/owner-registrations/${id}/accept`, { method: "POST", body }),
};

// Owner 401s must never invoke staff recovery or clear the staff session.
export const ownerRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>(`/owner${path}`, { method, body, authRecovery: false }, "Не удалось выполнить запрос. Повторите попытку.");

export const ownerFiles = {
  list: (animalId: string) => ownerRequest<OwnerFile[]>(`/animals/${animalId}/files`),
  download: (id: string) => apiBlob(`/owner/files/${id}`, "Не удалось скачать файл", false),
};

export type VisitStatus = Schemas["VisitRead"]["status"];
export type VisitQuestion = VisitQuestionnaire["questions"][number];
export type VisitAnswerValue = string | number | string[];
export type VisitFile = Schemas["VisitFileRead"];
export type OwnerVisit = Schemas["VisitRead"];
export type StaffVisit = Schemas["StaffVisitRead"];
export type VisitConfirm = Schemas["VisitConfirm"];
export const visitRequestsApi = {
  list: () => apiRequest<StaffVisit[]>("/visit-requests?status=requested"),
  confirm: (id: string, body: VisitConfirm) => apiRequest<OwnerVisit>(`/visit-requests/${id}/confirm`, { method: "POST", body }),
  reject: (id: string, reason: string) => apiRequest<OwnerVisit>(`/visit-requests/${id}/reject`, { method: "POST", body: { reason: reason.trim() || null } }),
  download: (id: string, fileId: string) => apiBlob(`/visit-requests/${id}/files/${fileId}`, "Не удалось скачать файл"),
};

export function visitAnswerLabel(answer: OwnerVisit["answers"][number]): string {
  if (answer.kind === "binary") return answer.value === "yes" ? "Да" : "Нет";
  if (answer.kind === "date" && typeof answer.value === "string") return answer.value.split("-").reverse().join(".");
  const values = Array.isArray(answer.value) ? answer.value : [answer.value];
  return values.map(value => answer.options?.find(option => option.value === value)?.label ?? String(value)).join(", ");
}
export const ownerVisits = {
  questions: (type: BookableVisitType) => ownerRequest<VisitQuestion[]>(`/visit-questions/${type}`),
  list: (animalId: string) => ownerRequest<OwnerVisit[]>(`/animals/${animalId}/visits`),
  create: (animalId: string, body: Schemas["VisitCreate"]) =>
    ownerRequest<OwnerVisit>(`/animals/${animalId}/visits`, "POST", body),
  change: (id: string, action: "withdraw" | "cancel") => ownerRequest<OwnerVisit>(`/visits/${id}/${action}`, "POST"),
  upload: (id: string, file: File) => {
    const body = new FormData(); body.append("file", file);
    return apiUpload<VisitFile>(`/owner/visits/${id}/files`, body, "Не удалось прикрепить файл", false);
  },
  download: (id: string, fileId: string) => apiBlob(`/owner/visits/${id}/files/${fileId}`, "Не удалось скачать файл", false),
};

export function ownerError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Не удалось выполнить запрос";
}
