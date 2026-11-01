import type { AppointmentStatus } from "@/features/appointments/api";
import { VISIT_STATUS_LABELS } from "@vetdietderm/owner-features/domain";
export { VISIT_TYPE_LABELS, BOOKABLE_VISIT_TYPES } from "@vetdietderm/owner-features/domain";
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: VISIT_STATUS_LABELS.scheduled,
  completed: VISIT_STATUS_LABELS.completed,
  cancelled: VISIT_STATUS_LABELS.cancelled,
  no_show: VISIT_STATUS_LABELS.no_show,
};
