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

