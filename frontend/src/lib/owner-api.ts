import { apiRequest } from "@/lib/api-client";
import type { Sex, Species } from "@/lib/api-client";

export interface DoctorPreview { doctor_name: string; organization_name: string | null }
export interface OwnerProfile extends DoctorPreview { uuid: string; name: string; email: string; phone: string }
export interface OwnerContact { name: string; email: string; phone: string }
export interface AnimalPassport { uuid: string; name: string; species: Species; breed: string; sex: Sex; birth_date: string | null }
export interface ChatMessage { uuid: string; author_kind: "owner" | "staff"; author_label: string; body: string; created_at: string }
export const chatApi = {
  list: (path: string, ownerView: boolean) => apiRequest<ChatMessage[]>(path, { authRecovery: !ownerView }),
  send: (path: string, ownerView: boolean, body: string) => apiRequest<ChatMessage>(path, { method: "POST", body: { body }, authRecovery: !ownerView }),
};
export interface PendingRegistration extends OwnerContact, DoctorPreview {
  uuid: string;
  can_accept: boolean;
  animals: AnimalPassport[];
}
export interface RegistrationAccept {
  mode: "create" | "link";
  client_uuid: string | null;
  matches: { owner_animal_id: string; patient_uuid: string | null }[];
}
export const registrationsApi = {
  list: () => apiRequest<PendingRegistration[]>("/owner-registrations"),
  patients: (id: string, clientId: string) => apiRequest<AnimalPassport[]>(`/owner-registrations/${id}/patients?client_uuid=${encodeURIComponent(clientId)}`),
  accept: (id: string, body: RegistrationAccept) => apiRequest<{ uuid: string; client_uuid: string; status: "accepted" }>(`/owner-registrations/${id}/accept`, { method: "POST", body }),
};

// Owner 401s must never invoke staff recovery or clear the staff session.
export const ownerRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>(`/owner${path}`, { method, body, authRecovery: false }, "Не удалось выполнить запрос. Повторите попытку.");

export function ownerError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Не удалось выполнить запрос";
}
