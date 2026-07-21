// Структурированный анамнез: наборы полей по специализациям,
// парсинг сохранённых данных и генерация текстовой сводки.

import type {
  AnamnesisData, ConsultationSpecialty, FeedingInfo, PetWithRelations,
} from "./types";
import { calculateAge } from "./nutrition";

export type AnamnesisFieldType = "select" | "chips" | "text" | "toggle";

export interface AnamnesisFieldDef {
  id: string;
  label: string;
  type: AnamnesisFieldType;
  options?: string[];
  placeholder?: string;
  hint?: string;
}

// ── Наборы полей ────────────────────────────────────────────────────────────

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
      "Спина", "Живот", "Уши (ушная раковина)", "Слуховые проходы", "Морда",
      "Вокруг глаз", "Лапы", "Межпальцевые пространства", "Подмышки", "Пах",
      "Хвост", "Перианальная область",
    ],
  },
  {
    id: "pruritusBehavior",
    label: "Проявления зуда",
    type: "chips",
    options: [
      "Чешется", "Вылизывается", "Грызёт лапы", "Трясёт головой",
      "Трётся мордой", "Выпадение шерсти",
    ],
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
  {
    id: "humansAffected",
    label: "Поражения кожи у людей в доме",
    type: "toggle",
  },
  {
    id: "environment",
    label: "Содержание и среда",
    type: "chips",
    options: [
      "Квартира", "Дом с участком", "Выгул в парке", "Контакт с водоёмами",
      "Много текстиля/ковров", "Контакт с другими животными на выгуле",
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
      "Снижение веса", "Набор веса", "Подбор рациона", "Пищевая аллергия",
      "Проблемы ЖКТ", "Болезнь почек", "Другое",
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
  {
    id: "tableFood",
    label: "Получает еду со стола",
    type: "toggle",
  },
  {
    id: "foodAccess",
    label: "Доступ к еде",
    type: "chips",
    options: [
      "Свободный доступ к корму", "Доступ к еде других животных",
      "Подбирает на улице", "Кормят несколько членов семьи",
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

export function getAnamnesisFields(specialty: ConsultationSpecialty): AnamnesisFieldDef[] {
  if (specialty === "dermatology") return DERMATOLOGY_FIELDS;
  if (specialty === "nutrition") return NUTRITION_FIELDS;
  return GENERAL_FIELDS;
}

// ── Кормление (карточка пациента) ───────────────────────────────────────────

export const FOOD_TYPE_OPTIONS = [
  { value: "commercial_dry", label: "Сухой промышленный" },
  { value: "commercial_wet", label: "Влажный промышленный" },
  { value: "mixed", label: "Смешанный (сухой + влажный)" },
  { value: "home_cooked", label: "Домашний рацион" },
  { value: "barf", label: "BARF / сыроедение" },
  { value: "other", label: "Другое" },
];

export function foodTypeLabel(value: string): string {
  return FOOD_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const EMPTY_FEEDING: FeedingInfo = {
  foodType: "commercial_dry",
  brand: "",
  dailyAmount: "",
  feedingsPerDay: "",
  treats: "",
  supplements: "",
  notes: "",
};

export function parseFeeding(json: string | null | undefined): FeedingInfo | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") return { ...EMPTY_FEEDING, ...parsed };
  } catch { /* ignore */ }
  return null;
}

export function feedingSummary(feeding: FeedingInfo | null): string {
  if (!feeding) return "";
  const parts = [
    foodTypeLabel(feeding.foodType),
    feeding.brand,
    feeding.dailyAmount && `${feeding.dailyAmount}/сут`,
    feeding.feedingsPerDay && `${feeding.feedingsPerDay} кормл./день`,
    feeding.treats && `лакомства: ${feeding.treats}`,
    feeding.supplements && `добавки: ${feeding.supplements}`,
    feeding.notes,
  ].filter(Boolean);
  return parts.join(" · ");
}

// ── Парсинг сохранённых данных ──────────────────────────────────────────────

export function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function parseAnamnesisData(json: string | null | undefined): AnamnesisData | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && parsed.answers) return parsed as AnamnesisData;
  } catch { /* ignore */ }
  return null;
}

// ── Базовые данные пациента (не перепечатываются врачом) ───────────────────

export interface BaselineItem {
  label: string;
  value: string;
  emphasis?: boolean;
}

const ACTIVITY_LABELS: Record<string, string> = {
  low: "Низкая",
  moderate: "Умеренная",
  high: "Высокая",
  very_high: "Очень высокая",
};

const LIFE_STAGE_LABELS: Record<string, string> = {
  puppy_kitten: "Щенок/котёнок",
  adult: "Взрослый",
  senior: "Пожилой",
  gestation: "Беременность",
  lactation: "Лактация",
};

export function buildBaseline(pet: PetWithRelations): BaselineItem[] {
  const allergies = parseStringArray(pet.allergies);
  const chronic = parseStringArray(pet.chronicConditions);
  const feeding = parseFeeding(pet.feeding);
  const items: BaselineItem[] = [
    { label: "Возраст", value: calculateAge(pet.birthDate).label },
    {
      label: "Пол",
      value: `${pet.sex === "male" ? "Самец" : "Самка"}${pet.neutered ? ", кастрирован" : ""}`,
    },
    { label: "Вес", value: `${pet.currentWeight} кг · BCS ${pet.bcs}/9` },
    { label: "Активность", value: ACTIVITY_LABELS[pet.activityLevel] ?? pet.activityLevel },
    { label: "Стадия жизни", value: LIFE_STAGE_LABELS[pet.lifeStage] ?? pet.lifeStage },
  ];
  items.push({
    label: "Аллергии",
    value: allergies.length > 0 ? allergies.join(", ") : "Не отмечены",
    emphasis: allergies.length > 0,
  });
  if (chronic.length > 0) items.push({ label: "Хронические состояния", value: chronic.join(", "), emphasis: true });
  if (feeding) items.push({ label: "Кормление", value: feedingSummary(feeding) });
  return items;
}

// ── Текстовая сводка (уходит в consultation.anamnesis) ─────────────────────

export function buildAnamnesisSummary(
  pet: PetWithRelations,
  specialty: ConsultationSpecialty,
  answers: Record<string, string | string[]>,
  freeText: string,
): string {
  const lines: string[] = [];
  const baseline = buildBaseline(pet)
    .map((item) => `${item.label}: ${item.value}`)
    .join("; ");
  lines.push(`Пациент: ${baseline}.`);

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
