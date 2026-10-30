import type { components } from "@vetdietderm/api-contract";
import { createHttpClient } from "@vetdietderm/api-client/http";
import type { BookableVisitType, VisitQuestionnaire } from "./domain";
type Schemas = components["schemas"];
const { apiRequest, apiBlob, apiUpload } = createHttpClient({ audience: "owner" });

export type DoctorPreview = Schemas["DoctorPreview"];
export type OwnerProfile = Schemas["OwnerRead"];
export type OwnerFile = Schemas["OwnerFileRead"];
export type OwnerContact = Schemas["OwnerProfileWrite"];
export type AnimalPassport = Schemas["AnimalRead"];
export type ChatMessage = Schemas["MessageRead"];
export const chatApi = {
  list: (path: string, _ownerView: boolean) => apiRequest<ChatMessage[]>(path, { authRecovery: false }),
  send: (path: string, _ownerView: boolean, body: string) => apiRequest<ChatMessage>(path, { method: "POST", body: { body }, authRecovery: false }),
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
