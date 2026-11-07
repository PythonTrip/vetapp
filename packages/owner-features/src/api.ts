import type { components } from "@vetdietderm/api-contract";
import { createHttpClient } from "@vetdietderm/api-client/http";
import type { VisitQuestionnaire } from "./domain";
type Schemas = components["schemas"];
const { apiRequest, apiBlob, apiUpload } = createHttpClient({ audience: "owner" });

export type DoctorPreview = Schemas["DoctorPreview"];
export type OwnerProfile = Schemas["OwnerRead"];
export type OwnerFile = Schemas["OwnerFileRead"];
export type OwnerContact = Schemas["OwnerProfileUpdate"];
export type AnimalPassport = Schemas["AnimalRead"];
export type ChatMessage = Schemas["MessageRead"];
export type OwnerUpload = Schemas["OwnerUploadRead"];
export interface ChatTransport {
  list: (path: string, ownerView: boolean) => Promise<ChatMessage[]>;
  send: (path: string, ownerView: boolean, body: string, attachmentIds?: string[]) => Promise<ChatMessage>;
  download?: (path: string, fileId: string) => Promise<Blob>;
}
export const chatApi = {
  list: (path: string, _ownerView: boolean) => apiRequest<ChatMessage[]>(path, { authRecovery: false }),
  send: (path: string, _ownerView: boolean, body: string, attachmentIds?: string[]) => apiRequest<ChatMessage>(path, { method: "POST", body: { body, ...(attachmentIds?.length ? { attachment_ids: attachmentIds } : {}) }, authRecovery: false }),
  download: (_path: string, fileId: string) => apiBlob(`/owner/uploads/${fileId}`, "Не удалось скачать вложение", false),
};
// Owner 401s must never invoke staff recovery or clear the staff session.
export const ownerRequest = <T,>(path: string, method = "GET", body?: unknown) =>
  apiRequest<T>(`/owner${path}`, { method, body, authRecovery: false }, "Не удалось выполнить запрос. Повторите попытку.");

export const ownerFiles = {
  list: (animalId: string) => ownerRequest<OwnerFile[]>(`/animals/${animalId}/files`),
  download: (id: string) => apiBlob(`/owner/files/${id}`, "Не удалось скачать файл", false),
};

export const OWNER_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
export function validateOwnerFile(file: File, photo = false) {
  if (!OWNER_UPLOAD_TYPES.includes(file.type) || (photo && !file.type.startsWith("image/"))) return "Выберите JPEG, PNG, WebP, GIF" + (photo ? "." : " или PDF.");
  if (!file.size || file.size > 8 * 1024 * 1024) return "Выберите непустой файл не больше 8 МБ.";
  return "";
}
export const ownerUploads = {
  list: (animalId: string) => ownerRequest<OwnerUpload[]>(`/animals/${animalId}/uploads`),
  upload: (animalId: string, file: File, kind: "photo" | "document" | "chat") => {
    const body = new FormData(); body.append("file", file); body.append("kind", kind);
    return apiUpload<OwnerUpload>(`/owner/animals/${animalId}/uploads`, body, "Не удалось загрузить файл", false);
  },
  download: (id: string) => apiBlob(`/owner/uploads/${id}`, "Не удалось скачать файл", false),
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
  questions: () => ownerRequest<VisitQuestion[]>("/visit-questions"),
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
  if (cause instanceof Error && /Failed to fetch|NetworkError|API unavailable|fetch failed|Load failed/i.test(cause.message)) return "Не удалось связаться с сервером. Проверьте подключение и повторите попытку.";
  return cause instanceof Error ? cause.message : "Не удалось выполнить запрос";
}
