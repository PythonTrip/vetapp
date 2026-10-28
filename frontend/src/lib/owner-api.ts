import { apiBlob, apiRequest, apiUpload } from "@/lib/api-client";
import type { BookableVisitType, Sex, Species, VisitQuestionnaire } from "@/lib/api-client";

export interface DoctorPreview { doctor_name: string; organization_name: string | null }
export interface OwnerProfile extends DoctorPreview { uuid: string; name: string; email: string; phone: string; linked: boolean }
export interface OwnerFile {
  uuid: string;
  caption: string | null;
  content_type: string;
  byte_size: number;
  created_at: string;
  uploaded_by_owner: boolean;
}
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

export const ownerFiles = {
  list: (animalId: string) => ownerRequest<OwnerFile[]>(`/animals/${animalId}/files`),
  download: (id: string) => apiBlob(`/owner/files/${id}`, "Не удалось скачать файл", false),
};

export type VisitStatus = "requested" | "scheduled" | "rejected" | "withdrawn" | "cancelled" | "completed" | "no_show";
export type VisitQuestion = VisitQuestionnaire["questions"][number];
export type VisitAnswerValue = string | number | string[];
export interface VisitFile { uuid: string; content_type: string; byte_size: number; created_at: string }
export interface OwnerVisit {
  uuid: string;
  owner_animal_uuid: string | null;
  patient_uuid: string | null;
  visit_type: BookableVisitType;
  proposed_starts_at: string;
  confirmed_starts_at: string | null;
  duration_min: number | null;
  status: VisitStatus;
  rejection_reason: string | null;
  answers: { question_id: string; label: string; kind: VisitQuestion["kind"]; value: VisitAnswerValue; options: VisitQuestion["options"] }[];
  files: VisitFile[];
  created_at: string;
}
export const ownerVisits = {
  questions: (type: BookableVisitType) => ownerRequest<VisitQuestion[]>(`/visit-questions/${type}`),
  list: (animalId: string) => ownerRequest<OwnerVisit[]>(`/animals/${animalId}/visits`),
  create: (animalId: string, body: { visit_type: BookableVisitType; proposed_starts_at: string; answers: { question_id: string; value: VisitAnswerValue }[] }) =>
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
