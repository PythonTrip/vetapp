import type { AppointmentStatus, VisitType } from "@/features/appointments/api";


export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  primary: "Первичный",
  secondary: "Повторный",
  supervision: "Курирование",
  consultation: "Консультация",
  recheck: "Повторный осмотр",
  procedure: "Процедура",
  telemedicine: "Дистанционно",
};

export const BOOKABLE_VISIT_TYPES = ["primary", "secondary", "consultation", "supervision"] as const;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Запланирована",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не явился",
};
