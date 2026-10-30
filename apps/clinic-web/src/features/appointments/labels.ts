import type { AppointmentStatus } from "@/features/appointments/api";
export { VISIT_TYPE_LABELS, BOOKABLE_VISIT_TYPES } from "@vetdietderm/owner-features/domain";
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Запланирована",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не явился",
};
