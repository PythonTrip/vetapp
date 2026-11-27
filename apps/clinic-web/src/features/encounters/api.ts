
import type { Schemas } from "@/shared/api/schema";
import { apiUpload, apiBlob, api } from "@/shared/api/client";

export type EncounterSpecialty = Schemas["EncounterSpecialty"];

export type EncounterType = Schemas["EncounterType"];

export type EncounterStatus = Schemas["EncounterStatus"];

export type AttachmentKind = Schemas["AttachmentKind"];

export type PrescriptionItem = Schemas["PrescriptionItem"];

export type AnamnesisData = Schemas["AnamnesisData"];

export type EncounterRecord = Schemas["EncounterRead"];

export type EncounterWrite = Schemas["EncounterWrite"];

export type AttachmentRecord = Schemas["AttachmentRead"];

export type AttachmentPatch = Schemas["AttachmentUpdate"];

export const encountersApi = {
  get: (id: string, fallbackMessage = "Не удалось загрузить приём") =>
    api.get<EncounterRecord>(`/encounters/${id}`, fallbackMessage),
  list: (patientId: string, fallbackMessage = "Не удалось загрузить приёмы") =>
    api.get<EncounterRecord[]>(`/patients/${patientId}/encounters`, fallbackMessage),
  create: (patientId: string, body: EncounterWrite, fallbackMessage = "Не удалось создать приём") =>
    api.post<EncounterRecord>(`/patients/${patientId}/encounters`, body, fallbackMessage),
  update: (id: string, body: Partial<EncounterWrite>, fallbackMessage = "Не удалось сохранить приём") =>
    api.patch<EncounterRecord>(`/encounters/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить приём") =>
    api.delete(`/encounters/${id}`, fallbackMessage),
};

export const attachmentsApi = {
  list: (patientId: string, fallbackMessage = "Не удалось загрузить галерею") =>
    api.get<AttachmentRecord[]>(`/patients/${patientId}/attachments`, fallbackMessage),
  upload: (patientId: string, body: FormData, fallbackMessage = "Не удалось загрузить файл") =>
    apiUpload<AttachmentRecord>(`/patients/${patientId}/attachments`, body, fallbackMessage),
  file: (id: string, fallbackMessage = "Не удалось открыть файл") =>
    apiBlob(`/attachments/${id}/file`, fallbackMessage),
  update: (id: string, body: AttachmentPatch, fallbackMessage = "Не удалось сохранить подпись") =>
    api.patch<AttachmentRecord>(`/attachments/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить файл") =>
    api.delete(`/attachments/${id}`, fallbackMessage),
};
