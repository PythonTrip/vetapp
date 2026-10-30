import type { components } from "@vetdietderm/api-contract";
import { apiRequest, apiBlob } from "@/shared/api/client";
import type { AnimalPassport, OwnerVisit, ChatMessage } from "@vetdietderm/owner-features/api";
type Schemas = components["schemas"];
export * from "@vetdietderm/owner-features/api";
export type PendingRegistration = Schemas["RegistrationRead"];
export type RegistrationAccept = Schemas["RegistrationAccept"];
export const registrationsApi = {
  list: () => apiRequest<PendingRegistration[]>("/owner-registrations"),
  patients: (id: string, clientId: string) => apiRequest<AnimalPassport[]>(`/owner-registrations/${id}/patients?client_uuid=${encodeURIComponent(clientId)}`),
  accept: (id: string, body: RegistrationAccept) => apiRequest<Schemas["RegistrationAccepted"]>(`/owner-registrations/${id}/accept`, { method: "POST", body }),
};

export type StaffVisit = Schemas["StaffVisitRead"];
export type VisitConfirm = Schemas["VisitConfirm"];
export const visitRequestsApi = {
  list: () => apiRequest<StaffVisit[]>("/visit-requests?status=requested"),
  confirm: (id: string, body: VisitConfirm) => apiRequest<OwnerVisit>(`/visit-requests/${id}/confirm`, { method: "POST", body }),
  reject: (id: string, reason: string) => apiRequest<OwnerVisit>(`/visit-requests/${id}/reject`, { method: "POST", body: { reason: reason.trim() || null } }),
  download: (id: string, fileId: string) => apiBlob(`/visit-requests/${id}/files/${fileId}`, "Не удалось скачать файл"),
};


export const staffChatApi = {
 list: (path: string) => apiRequest<ChatMessage[]>(path),
 send: (path: string, _ownerView: boolean, body: string) => apiRequest<ChatMessage>(path, { method: "POST", body: { body } }),
};
