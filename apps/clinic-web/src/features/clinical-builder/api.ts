
import type { Schemas } from "@/shared/api/schema";
import { api } from "@/shared/api/client";

export type EncounterTemplateScope = Schemas["TemplateScope"];

export type EncounterTemplateSection = Schemas["TemplateSection"];

export type ClinicalCatalogKind = Schemas["ClinicalCatalogKind"];

export type ClinicalCatalogScope = Schemas["ClinicalCatalogScope"];

export type EncounterTemplateRecord = Schemas["EncounterTemplateRead"];

export type EncounterTemplateWrite = Schemas["EncounterTemplateWrite"];

export type ClinicalCatalogItemRecord = Schemas["ClinicalCatalogItemRead"];

export type ClinicalCatalogItemWrite = Schemas["ClinicalCatalogItemWrite"];

function encounterTemplateListUrl(doctorName?: string): string {
  if (!doctorName?.trim()) return "/encounter-templates";
  const params = new URLSearchParams({ doctorName: doctorName.trim() });
  return `/encounter-templates?${params.toString()}`;
}

export const encounterTemplatesApi = {
  list: (doctorName?: string, fallbackMessage = "Не удалось загрузить шаблоны") =>
    api.get<EncounterTemplateRecord[]>(encounterTemplateListUrl(doctorName), fallbackMessage),
  create: (body: EncounterTemplateWrite, fallbackMessage = "Не удалось создать шаблон") =>
    api.post<EncounterTemplateRecord>("/encounter-templates", body, fallbackMessage),
  update: (
    id: string,
    body: Partial<EncounterTemplateWrite>,
    fallbackMessage = "Не удалось сохранить шаблон",
  ) => api.patch<EncounterTemplateRecord>(`/encounter-templates/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить шаблон") =>
    api.delete(`/encounter-templates/${id}`, fallbackMessage),
};

function clinicalCatalogListUrl(doctorName?: string): string {
  if (!doctorName?.trim()) return "/clinical-catalog";
  const params = new URLSearchParams({ doctorName: doctorName.trim() });
  return `/clinical-catalog?${params.toString()}`;
}

export const clinicalCatalogApi = {
  list: (doctorName?: string, fallbackMessage = "Не удалось загрузить клинические пункты") =>
    api.get<ClinicalCatalogItemRecord[]>(clinicalCatalogListUrl(doctorName), fallbackMessage),
  create: (body: ClinicalCatalogItemWrite, fallbackMessage = "Не удалось создать клинический пункт") =>
    api.post<ClinicalCatalogItemRecord>("/clinical-catalog", body, fallbackMessage),
  update: (
    id: string,
    body: Partial<ClinicalCatalogItemWrite>,
    fallbackMessage = "Не удалось сохранить клинический пункт",
  ) => api.patch<ClinicalCatalogItemRecord>(`/clinical-catalog/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить клинический пункт") =>
    api.delete(`/clinical-catalog/${id}`, fallbackMessage),
};
