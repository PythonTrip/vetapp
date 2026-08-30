import type {
  AppointmentStatus,
  CommunicationChannel,
  CommunicationDirection,
  EncounterSpecialty,
  EncounterStatus,
  EncounterType,
  VisitType,
} from "@/lib/api-client";

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

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  consultation: "Консультация",
  recheck: "Повторный осмотр",
  procedure: "Процедура",
  telemedicine: "Дистанционно",
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Запланирована",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не явился",
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

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return date.toISOString();
}
