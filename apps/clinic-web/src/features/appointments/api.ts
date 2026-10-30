import { dataOf } from "@vetdietderm/api-client";
import type { Schemas } from "@/shared/api/schema";
import { staffContractClient, api } from "@/shared/api/client";

export type BookableVisitType = Schemas["QuestionnaireRead"]["visit_type"];

export type VisitQuestionKind = Schemas["QuestionKind"];

export type VisitQuestionWrite = Schemas["QuestionWrite"];

export type VisitQuestionnaire = Schemas["QuestionnaireRead"];

export const visitQuestionnairesApi = {
  list: async () => dataOf(await staffContractClient.GET("/visit-questionnaires")),
  save: async (type: BookableVisitType, questions: VisitQuestionWrite[]) =>
    dataOf(await staffContractClient.PUT("/visit-questionnaires/{visit_type}", {
      params: { path: { visit_type: type } }, body: { questions },
    })),
};

export type AppointmentStatus = Schemas["AppointmentStatus"];

export type VisitType = Schemas["AppointmentRead"]["visit_type"];

export type AppointmentRecord = Schemas["AppointmentRead"];

export type AppointmentWrite = Schemas["AppointmentWrite"];

export type AppointmentPatch = Schemas["AppointmentUpdate"];

function appointmentListUrl(params?: { patientId?: string; from?: string; to?: string }): string {
  const search = new URLSearchParams();
  if (params?.patientId) search.set("patientId", params.patientId);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const query = search.toString();
  return query ? `/appointments?${query}` : "/appointments";
}

export const appointmentsApi = {
  get: (id: string, fallbackMessage = "Не удалось загрузить запись") =>
    api.get<AppointmentRecord>(`/appointments/${id}`, fallbackMessage),
  list: (
    params?: { patientId?: string; from?: string; to?: string },
    fallbackMessage = "Не удалось загрузить расписание",
  ) => api.get<AppointmentRecord[]>(appointmentListUrl(params), fallbackMessage),
  create: (body: AppointmentWrite, fallbackMessage = "Не удалось создать запись") =>
    api.post<AppointmentRecord>("/appointments", body, fallbackMessage),
  update: (id: string, body: AppointmentPatch, fallbackMessage = "Не удалось сохранить запись") =>
    api.patch<AppointmentRecord>(`/appointments/${id}`, body, fallbackMessage),
  delete: (id: string, fallbackMessage = "Не удалось удалить запись") =>
    api.delete(`/appointments/${id}`, fallbackMessage),
};
