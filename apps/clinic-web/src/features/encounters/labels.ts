import type { CommunicationChannel, CommunicationDirection, EncounterSpecialty, EncounterStatus, EncounterType } from "@/features/encounters/api";


export const SPECIALTY_LABELS: Record<EncounterSpecialty, string> = {
  dermatology: "Дерматология",
  nutrition: "Диетология",
  general: "Общий",
};

export const ENCOUNTER_TYPE_LABELS: Record<EncounterType, string> = {
  appointment: "Приём",
  note: "Заметка",
  diagnostic: "Диагностика",
  treatment: "Лечение",
};

export const ENCOUNTER_STATUS_LABELS: Record<EncounterStatus, string> = {
  draft: "Черновик",
  in_progress: "В работе",
  completed: "Завершён",
};

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  phone: "Телефон",
  email: "Email",
  text: "Сообщение",
  video: "Видео",
  in_person: "Очно",
};

export const DIRECTION_LABELS: Record<CommunicationDirection, string> = {
  inbound: "Входящий",
  outbound: "Исходящий",
};
