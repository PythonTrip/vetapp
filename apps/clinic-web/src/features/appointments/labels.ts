import type { AppointmentStatus } from "@/features/appointments/api";
import { VISIT_STATUS_LABELS } from "@/shared/domain/visits";

export { VISIT_TYPE_LABELS, BOOKABLE_VISIT_TYPES } from "@/shared/domain/visits";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: VISIT_STATUS_LABELS.scheduled,
  completed: VISIT_STATUS_LABELS.completed,
  cancelled: VISIT_STATUS_LABELS.cancelled,
  no_show: VISIT_STATUS_LABELS.no_show,
};
