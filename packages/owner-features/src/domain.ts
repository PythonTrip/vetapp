import type { components } from "@vetdietderm/api-contract";
type Schemas = components["schemas"];
type Sex = NonNullable<Schemas["AnimalRead"]["sex"]>;
type Species = Schemas["AnimalRead"]["species"];
type VisitType = Schemas["AppointmentRead"]["visit_type"];
export type BookableVisitType = Schemas["QuestionnaireRead"]["visit_type"];
export type VisitQuestionnaire = Schemas["QuestionnaireRead"];
export const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "unspecified", label: "Не указан" },
  { value: "male", label: "Самец" },
  { value: "female", label: "Самка" },
];

export function sexLabel(sex: Sex): string {
  return SEX_OPTIONS.find(option => option.value === sex)?.label ?? "Не указан";
}

export const SPECIES_OPTIONS: { value: Species; label: string }[] = [
  { value: "dog", label: "Собака" },
  { value: "cat", label: "Кошка" },
  { value: "other", label: "Другое" },
];

export function speciesLabel(species: Species): string {
  return SPECIES_OPTIONS.find((option) => option.value === species)?.label ?? species;
}

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

export const VISIT_STATUS_LABELS = {
  requested: "Ожидает подтверждения", scheduled: "Подтверждён", rejected: "Отклонён",
  withdrawn: "Заявка отозвана", cancelled: "Отменён", completed: "Завершён", no_show: "Не состоялся",
} as const;
export type ConsultationStatus = keyof typeof VISIT_STATUS_LABELS;
export const VISIT_STATUS_STYLES = {
  waiting: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  active: "bg-accent text-accent-foreground",
  done: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  closed: "bg-muted text-foreground",
} as const;

/** Time is a reminder only. A running consultation requires a real encounter. */
export function consultationState(status: ConsultationStatus, startsAt?: string | null, encounterStatus?: string | null, now = Date.now()) {
  if (status === "cancelled" || status === "rejected" || status === "withdrawn" || status === "no_show") {
    return { label: VISIT_STATUS_LABELS[status], tone: "closed" as const, next: status === "rejected" ? "Выберите другое время и отправьте новую заявку." : "При необходимости можно отправить новую заявку." };
  }
  if (status === "completed" || encounterStatus === "completed") return { label: "Завершён", tone: "done" as const, next: "Откройте доступные результаты этого приёма." };
  if (encounterStatus === "in_progress") return { label: "Идёт консультация", tone: "active" as const, next: "Врач проводит приём. Результаты появятся после публикации." };
  if (status === "requested") return { label: VISIT_STATUS_LABELS.requested, tone: "waiting" as const, next: "Врач рассмотрит заявку и подтвердит время. Пока запись не подтверждена." };
  const remaining = startsAt ? new Date(startsAt).getTime() - now : Infinity;
  if (remaining >= 0 && remaining <= 30 * 60_000) return { label: "Скоро начнётся", tone: "active" as const, next: "До назначенного времени меньше 30 минут. Подготовьтесь к консультации." };
  return { label: VISIT_STATUS_LABELS.scheduled, tone: "active" as const, next: remaining < 0 ? "Назначенное время прошло. Ожидайте обновления статуса врачом." : "Время подтверждено врачом. Если нужен перенос, напишите врачу." };
}

