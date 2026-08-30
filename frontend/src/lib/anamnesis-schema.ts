import type { AnamnesisData, EncounterSpecialty, PatientRecord } from "@/lib/api-client";
import { ACTIVITY_OPTIONS, LIFE_STAGE_OPTIONS } from "@/lib/patient-form";

export type AnamnesisFieldType = "select" | "chips" | "text" | "toggle";

export interface AnamnesisFieldDef {
  id: string;
  label: string;
  type: AnamnesisFieldType;
  options?: string[];
  placeholder?: string;
}

export const DERMATOLOGY_FIELDS: AnamnesisFieldDef[] = [
  {
    id: "duration",
    label: "Давность симптомов",
    type: "select",
    options: ["Меньше недели", "1–4 недели", "1–3 месяца", "3–12 месяцев", "Больше года"],
  },
  {
    id: "course",
    label: "Течение",
    type: "select",
    options: ["Впервые", "Постоянное", "Рецидивирующее", "Ухудшается", "Улучшается"],
  },
  {
    id: "seasonality",
    label: "Сезонность",
    type: "select",
    options: ["Круглогодично", "Весна", "Лето", "Осень", "Зима", "Не прослеживается"],
  },
  {
    id: "lesionSites",
    label: "Локализация поражений",
    type: "chips",
    options: [
      "Спина",
      "Живот",
      "Уши (ушная раковина)",
      "Слуховые проходы",
      "Морда",
      "Вокруг глаз",
      "Лапы",
      "Межпальцевые пространства",
      "Подмышки",
      "Пах",
      "Хвост",
      "Перианальная область",
    ],
  },
  {
    id: "pruritusBehavior",
    label: "Проявления зуда",
    type: "chips",
    options: ["Чешется", "Вылизывается", "Грызёт лапы", "Трясёт головой", "Трётся мордой", "Выпадение шерсти"],
  },
  {
    id: "parasiteControl",
    label: "Обработки от эктопаразитов",
    type: "select",
    options: ["Регулярно, в срок", "Нерегулярно", "Просрочена", "Не проводится"],
  },
  {
    id: "parasiteProduct",
    label: "Препарат и дата последней обработки",
    type: "text",
    placeholder: "Например: Бравекто, 15.06.2026",
  },
  {
    id: "otherAnimals",
    label: "Другие животные в доме",
    type: "select",
    options: ["Нет", "Есть, без симптомов", "Есть, тоже чешутся"],
  },
  { id: "humansAffected", label: "Поражения кожи у людей в доме", type: "toggle" },
  {
    id: "environment",
    label: "Содержание и среда",
    type: "chips",
    options: [
      "Квартира",
      "Дом с участком",
      "Выгул в парке",
      "Контакт с водоёмами",
      "Много текстиля/ковров",
      "Контакт с другими животными на выгуле",
    ],
  },
  {
    id: "pastTreatment",
    label: "Прежнее лечение и ответ",
    type: "text",
    placeholder: "Чем лечили раньше и как отвечал пациент…",
  },
];

export const NUTRITION_FIELDS: AnamnesisFieldDef[] = [
  {
    id: "goal",
    label: "Цель обращения",
    type: "select",
    options: [
      "Снижение веса",
      "Набор веса",
      "Подбор рациона",
      "Пищевая аллергия",
      "Проблемы ЖКТ",
      "Болезнь почек",
      "Другое",
    ],
  },
  {
    id: "appetite",
    label: "Аппетит",
    type: "select",
    options: ["Повышен", "Обычный", "Снижен", "Избирательный", "Отсутствует"],
  },
  {
    id: "stool",
    label: "Стул",
    type: "select",
    options: ["Норма", "Мягкий", "Диарея", "Запор", "Чередуется"],
  },
  {
    id: "vomiting",
    label: "Рвота",
    type: "select",
    options: ["Нет", "Реже раза в неделю", "Еженедельно", "Ежедневно"],
  },
  {
    id: "weightDynamics",
    label: "Динамика веса со слов владельца",
    type: "select",
    options: ["Стабильный", "Набирает", "Теряет", "Колеблется"],
  },
  {
    id: "waterIntake",
    label: "Потребление воды",
    type: "select",
    options: ["Обычное", "Повышенное", "Сниженное"],
  },
  { id: "tableFood", label: "Получает еду со стола", type: "toggle" },
  {
    id: "foodAccess",
    label: "Доступ к еде",
    type: "chips",
    options: [
      "Свободный доступ к корму",
      "Доступ к еде других животных",
      "Подбирает на улице",
      "Кормят несколько членов семьи",
    ],
  },
  {
    id: "dietHistory",
    label: "История рационов",
    type: "text",
    placeholder: "Какие рационы пробовали, как переносил, результат…",
  },
];

export const GENERAL_FIELDS: AnamnesisFieldDef[] = [
  {
    id: "duration",
    label: "Давность симптомов",
    type: "select",
    options: ["Меньше недели", "1–4 недели", "1–3 месяца", "3–12 месяцев", "Больше года"],
  },
  {
    id: "course",
    label: "Течение",
    type: "select",
    options: ["Впервые", "Постоянное", "Рецидивирующее", "Ухудшается", "Улучшается"],
  },
  {
    id: "pastTreatment",
    label: "Прежнее лечение и ответ",
    type: "text",
    placeholder: "Чем лечили раньше и как отвечал пациент…",
  },
];

export const BODY_REGIONS = DERMATOLOGY_FIELDS.find((field) => field.id === "lesionSites")?.options ?? [];

export function getAnamnesisFields(specialty: EncounterSpecialty): AnamnesisFieldDef[] {
  if (specialty === "dermatology") return DERMATOLOGY_FIELDS;
  if (specialty === "nutrition") return NUTRITION_FIELDS;
  return GENERAL_FIELDS;
}

export const EXAM_STARTERS: Record<EncounterSpecialty, string> = {
  dermatology:
    "Кожа и шерсть: .\nЛокализация: .\nЦитология / соскоб: .\nОтоскопия: .",
  nutrition: "BCS/MCS: .\nТекущий рацион: .\nСтул / рвота: .\nЦель: .",
  general: "Общее состояние: .\nСлизистые: .\nЛимфоузлы: .\nАускультация: .",
};

export const PLAN_STARTERS: Record<EncounterSpecialty, string> = {
  dermatology: "Обработка от эктопаразитов.\nМестная терапия.\nКонтроль VAS и фото через 14 дней.",
  nutrition: "Целевой вес и калорийность.\nКонтроль веса через 14 дней.\nОграничить лакомства.",
  general: "Назначения.\nКонтрольный осмотр.",
};

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string | null,
): string {
  if (!value) return "не указано";
  return options.find((option) => option.value === value)?.label ?? value;
}

export function buildBaseline(patient: PatientRecord): string {
  const parts = [
    patient.birth_date ? `дата рождения ${patient.birth_date}` : null,
    patient.body_weight_kg != null ? `${patient.body_weight_kg} кг` : null,
    patient.bcs != null ? `BCS ${patient.bcs}/9` : null,
    `активность ${optionLabel(ACTIVITY_OPTIONS, patient.activity)}`,
    `стадия ${optionLabel(LIFE_STAGE_OPTIONS, patient.life_stage)}`,
    patient.allergies.length ? `аллергии: ${patient.allergies.join(", ")}` : "аллергии не отмечены",
    patient.chronic_conditions.length ? `хроническое: ${patient.chronic_conditions.join(", ")}` : null,
    patient.feeding_notes ? `кормление: ${patient.feeding_notes}` : null,
  ].filter(Boolean);
  return parts.join("; ");
}

export function buildAnamnesisSummary(
  patient: PatientRecord,
  specialty: EncounterSpecialty,
  answers: Record<string, string | string[]>,
  freeText: string,
): string {
  const lines = [`Пациент: ${buildBaseline(patient)}.`];
  for (const field of getAnamnesisFields(specialty)) {
    const value = answers[field.id];
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) lines.push(`${field.label}: ${value.join(", ")}.`);
    } else if (field.type === "toggle") {
      if (value === "yes") lines.push(`${field.label}: да.`);
    } else if (String(value).trim()) {
      lines.push(`${field.label}: ${String(value).trim()}.`);
    }
  }
  if (freeText.trim()) lines.push(freeText.trim());
  return lines.join("\n");
}

export function emptyAnamnesis(specialty: EncounterSpecialty): AnamnesisData {
  return { specialty, answers: {}, free_text: "" };
}
