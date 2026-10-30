
import type { Schemas } from "@/shared/api/schema";
import { api } from "@/shared/api/client";

export type Species = Schemas["Species"];

export type ClientRecord = Schemas["ClientRead"];

export type Sex = Schemas["Sex"];

export type PatientRecord = Schemas["PatientRead"];

export type ClientWrite = Schemas["ClientCreate"];

export type PatientWrite = Schemas["PatientCreate"];

export type PatientPatch = Schemas["PatientUpdate"];

function searchUrl(path: string, q: string): string {
  const params = new URLSearchParams();
  params.set("q", q);
  return `${path}?${params.toString()}`;
}

export const clientsApi = {
  list: (q = "", fallbackMessage = "Не удалось загрузить клиентов") =>
    api.get<ClientRecord[]>(searchUrl("/clients", q), fallbackMessage),
  get: (id: string, fallbackMessage = "Клиент не найден") =>
    api.get<ClientRecord>(`/clients/${id}`, fallbackMessage),
  create: (body: ClientWrite, fallbackMessage = "Не удалось создать клиента") =>
    api.post<ClientRecord>("/clients", body, fallbackMessage),
  update: (id: string, body: ClientWrite, fallbackMessage = "Не удалось сохранить клиента") =>
    api.patch<ClientRecord>(`/clients/${id}`, body, fallbackMessage),
};

export const patientsApi = {
  list: (q = "", fallbackMessage = "Не удалось загрузить пациентов") =>
    api.get<PatientRecord[]>(searchUrl("/patients", q), fallbackMessage),
  get: (id: string, fallbackMessage = "Пациент не найден") =>
    api.get<PatientRecord>(`/patients/${id}`, fallbackMessage),
  create: (body: PatientWrite, fallbackMessage = "Не удалось создать пациента") =>
    api.post<PatientRecord>("/patients", body, fallbackMessage),
  update: (id: string, body: PatientPatch, fallbackMessage = "Не удалось сохранить пациента") =>
    api.patch<PatientRecord>(`/patients/${id}`, body, fallbackMessage),
};
