import { ApiConnectionError, ApiError, type PatientRecord, type PatientWrite, type Species } from "@/lib/api-client";

export const SPECIES_OPTIONS: { value: Species; label: string }[] = [
  { value: "dog", label: "Собака" },
  { value: "cat", label: "Кошка" },
  { value: "other", label: "Другое" },
];

export const LIFE_STAGE_OPTIONS = [
  { value: "puppy_kitten", label: "Щенок / котёнок" },
  { value: "adult", label: "Взрослый" },
  { value: "senior", label: "Пожилой" },
  { value: "gestation", label: "Беременность" },
  { value: "lactation", label: "Лактация" },
] as const;

export const ACTIVITY_OPTIONS = [
  { value: "low", label: "Низкая" },
  { value: "moderate", label: "Умеренная" },
  { value: "high", label: "Высокая" },
  { value: "very_high", label: "Очень высокая" },
] as const;

export function speciesLabel(species: Species): string {
  return SPECIES_OPTIONS.find((option) => option.value === species)?.label ?? species;
}

export function formatWeightKg(value: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} кг`;
}

export type PatientFormValues = {
  name: string;
  species: Species;
  breed: string;
  body_weight_kg: string;
  expected_adult_weight_kg: string;
  birth_date: string;
  life_stage: string;
  activity: string;
  neutered: boolean;
  pregnant: boolean;
  lactating: boolean;
  lactation_week: string;
  litter_size: string;
  bcs: string;
  allergies: string;
  chronic_conditions: string;
  feeding_notes: string;
};

export const emptyPatientForm = (): PatientFormValues => ({
  name: "",
  species: "dog",
  breed: "",
  body_weight_kg: "",
  expected_adult_weight_kg: "",
  birth_date: "",
  life_stage: "",
  activity: "",
  neutered: false,
  pregnant: false,
  lactating: false,
  lactation_week: "",
  litter_size: "",
  bcs: "",
  allergies: "",
  chronic_conditions: "",
  feeding_notes: "",
});

export function patientToForm(patient: PatientRecord): PatientFormValues {
  return {
    name: patient.name,
    species: patient.species,
    breed: patient.breed,
    body_weight_kg: patient.body_weight_kg == null ? "" : String(patient.body_weight_kg),
    expected_adult_weight_kg:
      patient.expected_adult_weight_kg == null ? "" : String(patient.expected_adult_weight_kg),
    birth_date: patient.birth_date ?? "",
    life_stage: patient.life_stage ?? "",
    activity: patient.activity ?? "",
    neutered: patient.neutered,
    pregnant: patient.pregnant,
    lactating: patient.lactating,
    lactation_week: patient.lactation_week == null ? "" : String(patient.lactation_week),
    litter_size: patient.litter_size == null ? "" : String(patient.litter_size),
    bcs: patient.bcs == null ? "" : String(patient.bcs),
    allergies: (patient.allergies ?? []).join(", "),
    chronic_conditions: (patient.chronic_conditions ?? []).join(", "),
    feeding_notes: patient.feeding_notes ?? "",
  };
}

function optionalNumber(raw: string, label: string, opts?: { gt?: number; ge?: number; le?: number }): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new Error(`Поле «${label}» должно быть числом`);
  }
  if (opts?.gt != null && !(value > opts.gt)) {
    throw new Error(`Поле «${label}» должно быть больше ${opts.gt}`);
  }
  if (opts?.ge != null && value < opts.ge) {
    throw new Error(`Поле «${label}» должно быть не меньше ${opts.ge}`);
  }
  if (opts?.le != null && value > opts.le) {
    throw new Error(`Поле «${label}» должно быть не больше ${opts.le}`);
  }
  return value;
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function formToPatientPayload(values: PatientFormValues): Omit<PatientWrite, "client_uuid"> {
  const name = values.name.trim();
  if (!name) {
    throw new Error("Укажите кличку пациента");
  }
  return {
    name,
    species: values.species,
    breed: values.breed.trim(),
    body_weight_kg: optionalNumber(values.body_weight_kg, "Вес", { gt: 0 }),
    expected_adult_weight_kg: optionalNumber(values.expected_adult_weight_kg, "Ожидаемый вес взрослого", {
      gt: 0,
    }),
    birth_date: values.birth_date.trim() || null,
    life_stage: values.life_stage.trim() || null,
    activity: values.activity.trim() || null,
    neutered: values.neutered,
    pregnant: values.pregnant,
    lactating: values.lactating,
    lactation_week: optionalNumber(values.lactation_week, "Неделя лактации", { ge: 0 }),
    litter_size: optionalNumber(values.litter_size, "Размер помёта", { ge: 0 }),
    bcs: optionalNumber(values.bcs, "BCS", { ge: 1, le: 9 }),
    allergies: splitList(values.allergies),
    chronic_conditions: splitList(values.chronic_conditions),
    feeding_notes: values.feeding_notes.trim() || null,
  };
}

export type ClientFormValues = {
  name: string;
  email: string;
  phone: string;
};

export const emptyClientForm = (): ClientFormValues => ({
  name: "",
  email: "",
  phone: "",
});

export function clientFormToPayload(values: ClientFormValues): { name: string; email: string | null; phone: string | null } {
  const name = values.name.trim();
  if (!name) {
    throw new Error("Укажите имя клиента");
  }
  return {
    name,
    email: values.email.trim() || null,
    phone: values.phone.trim() || null,
  };
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiConnectionError) {
    return "Не удалось связаться с API. Проверьте, что сервер запущен.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return "Нет доступа. Обновите страницу и войдите снова.";
    if (error.status === 422) return error.message.trim() || "Проверьте введённые данные.";
    return error.message.trim() || "Не удалось выполнить запрос.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Не удалось выполнить запрос.";
}
