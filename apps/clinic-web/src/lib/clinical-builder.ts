import type {
  ClinicalCatalogItemRecord,
  EncounterSpecialty,
  EncounterTemplateRecord,
} from "@/lib/api-client";

export type ClinicalFieldType =
  | "binary"
  | "single_select"
  | "multi_select"
  | "number"
  | "text"
  | "date";

export type ClinicalDocumentKind = "anamnesis" | "exam";
export type ClinicalItemScope = "standard" | "clinic" | "doctor";

export interface ClinicalOption {
  value: string;
  label: string;
  text?: string;
  normal?: boolean;
}

export interface ClinicalClarification {
  when: string[];
  placeholder: string;
  label?: string;
}

export interface ClinicalField {
  id: string;
  key: string;
  label: string;
  type: ClinicalFieldType;
  sectionId: string;
  options?: ClinicalOption[];
  unit?: string;
  placeholder?: string;
  textTemplate?: string;
  clarification?: ClinicalClarification;
  frequent?: boolean;
  scope?: ClinicalItemScope;
}

export interface ClinicalSection {
  id: string;
  key: string;
  label: string;
  kind: ClinicalDocumentKind;
  fieldIds: string[];
  disclosure?: "standard" | "system";
  statusFieldId?: string;
  scope?: ClinicalItemScope;
}

export interface VisitTemplateDefinition {
  kind: "structured";
  sectionIds: string[];
  sectionFieldIds?: Record<string, string[]>;
}

export interface VisitTemplate {
  id: string;
  title: string;
  specialty: EncounterSpecialty;
  documentKind: ClinicalDocumentKind;
  scope: ClinicalItemScope;
  definition: VisitTemplateDefinition;
  source?: EncounterTemplateRecord;
}

export interface ClinicalFieldValue {
  fieldId: string;
  type: ClinicalFieldType;
  value: unknown;
  note?: string;
}

export interface ClinicalDocument {
  version: 1;
  kind: ClinicalDocumentKind;
  templateId?: string;
  sectionIds: string[];
  sectionFieldIds: Record<string, string[]>;
  values: ClinicalFieldValue[];
  finalText: string;
  textEdited: boolean;
}

export interface ClinicalBuilderCatalog {
  fields: ClinicalField[];
  sections: ClinicalSection[];
  templates: VisitTemplate[];
}

const option = (value: string, label: string, text?: string, normal?: boolean): ClinicalOption => ({
  value,
  label,
  text,
  normal,
});

const fields: ClinicalField[] = [
  {
    id: "field.animal_contact",
    key: "animal_contact",
    label: "Контакт с животными",
    type: "single_select",
    sectionId: "section.housing",
    options: [
      option("no", "Нет", "Контакта с другими животными нет.", true),
      option("yes", "Да", "Имеется контакт с другими животными."),
      option("unknown", "Неизвестно", "Контакт с другими животными неизвестен."),
    ],
    frequent: true,
  },
  {
    id: "field.housing",
    key: "housing",
    label: "Место содержания",
    type: "single_select",
    sectionId: "section.housing",
    options: [
      option("apartment", "Квартира", "Животное содержится в квартире."),
      option("house", "Дом", "Животное содержится в доме."),
      option("outdoor", "Улица", "Животное содержится на улице."),
      option("mixed", "Смешанное", "Содержание смешанное."),
    ],
    frequent: true,
  },
  {
    id: "field.other_animals",
    key: "other_animals",
    label: "Другие животные",
    type: "multi_select",
    sectionId: "section.housing",
    options: [
      option("dogs", "Собаки"),
      option("cats", "Кошки"),
      option("birds", "Птицы"),
      option("rodents", "Грызуны"),
      option("none", "Нет", "Других животных в доме нет.", true),
    ],
  },
  {
    id: "field.walking",
    key: "walking",
    label: "Выгул",
    type: "single_select",
    sectionId: "section.housing",
    options: [option("none", "Нет", "Без выгула.", true), option("leash", "На поводке"), option("free", "Свободный")],
  },
  {
    id: "field.vaccination",
    key: "vaccination",
    label: "Вакцинация",
    type: "single_select",
    sectionId: "section.prevention",
    options: [
      option("current", "Актуальна", "Вакцинация актуальна.", true),
      option("overdue", "Просрочена", "Вакцинация просрочена."),
      option("none", "Не проводилась", "Вакцинация не проводилась."),
      option("unknown", "Неизвестно", "Статус вакцинации неизвестен."),
    ],
    frequent: true,
  },
  {
    id: "field.vaccination_date",
    key: "vaccination_date",
    label: "Дата последней вакцинации",
    type: "date",
    sectionId: "section.prevention",
    textTemplate: "Последняя вакцинация: {{value}}.",
  },
  {
    id: "field.vaccine_type",
    key: "vaccine_type",
    label: "Тип вакцины",
    type: "text",
    sectionId: "section.prevention",
    placeholder: "Название препарата",
    textTemplate: "Вакцина: {{value}}.",
  },
  {
    id: "field.parasite_control",
    key: "parasite_control",
    label: "Обработка от паразитов",
    type: "single_select",
    sectionId: "section.prevention",
    options: [
      option("current", "В срок", "Обработки от паразитов проводятся в срок.", true),
      option("irregular", "Нерегулярно", "Обработки от паразитов нерегулярные."),
      option("overdue", "Просрочена", "Обработка от паразитов просрочена."),
      option("none", "Не проводится", "Обработки от паразитов не проводятся."),
    ],
  },
  {
    id: "field.appetite",
    key: "appetite",
    label: "Аппетит",
    type: "single_select",
    sectionId: "section.nutrition",
    options: [
      option("normal", "Норма", "Аппетит сохранён.", true),
      option("increased", "Повышен", "Аппетит повышен."),
      option("decreased", "Снижен", "Аппетит снижен."),
      option("absent", "Отсутствует", "Аппетит отсутствует."),
    ],
    frequent: true,
  },
  {
    id: "field.feeding_type",
    key: "feeding_type",
    label: "Тип кормления",
    type: "multi_select",
    sectionId: "section.nutrition",
    options: [option("commercial", "Готовый рацион"), option("home", "Домашний"), option("mixed", "Смешанный"), option("treats", "Лакомства")],
  },
  {
    id: "field.feeding_frequency",
    key: "feeding_frequency",
    label: "Кратность кормления",
    type: "number",
    sectionId: "section.nutrition",
    unit: "раз/сут",
    textTemplate: "Кормление {{value}} раз в сутки.",
  },
  {
    id: "field.water_intake",
    key: "water_intake",
    label: "Потребление воды",
    type: "single_select",
    sectionId: "section.nutrition",
    options: [option("normal", "Обычное", "Потребление воды обычное.", true), option("increased", "Повышено", "Потребление воды повышено."), option("decreased", "Снижено", "Потребление воды снижено.")],
  },
  {
    id: "field.vomiting",
    key: "vomiting",
    label: "Рвота",
    type: "single_select",
    sectionId: "section.gastrointestinal",
    options: [option("no", "Нет", "Рвоты нет.", true), option("yes", "Есть", "Отмечается рвота.")],
    clarification: { when: ["yes"], label: "Частота и длительность", placeholder: "Например: 2 раза в неделю, около месяца" },
    frequent: true,
  },
  {
    id: "field.stool",
    key: "stool",
    label: "Стул",
    type: "single_select",
    sectionId: "section.gastrointestinal",
    options: [option("normal", "Оформленный", "Стул оформленный.", true), option("soft", "Мягкий", "Стул мягкий."), option("diarrhea", "Диарея", "Отмечается диарея."), option("constipation", "Запор", "Отмечается запор.")],
    clarification: { when: ["soft", "diarrhea", "constipation"], placeholder: "Частота, примеси, длительность" },
  },
  {
    id: "field.urination",
    key: "urination",
    label: "Мочеиспускание",
    type: "single_select",
    sectionId: "section.urinary",
    options: [option("normal", "Без изменений", "Мочеиспускание без изменений.", true), option("frequent", "Учащено", "Мочеиспускание учащено."), option("difficult", "Затруднено", "Мочеиспускание затруднено."), option("absent", "Отсутствует", "Мочеиспускание отсутствует.")],
  },
  {
    id: "field.neutered",
    key: "neutered",
    label: "Стерилизация / кастрация",
    type: "binary",
    sectionId: "section.reproduction",
    options: [option("yes", "Да", "Животное стерилизовано / кастрировано."), option("no", "Нет", "Животное не стерилизовано / не кастрировано.")],
  },
  {
    id: "field.pruritus_duration",
    key: "pruritus_duration",
    label: "Длительность зуда",
    type: "single_select",
    sectionId: "section.dermatology_history",
    options: [option("week", "До недели"), option("month", "1–4 недели"), option("quarter", "1–3 месяца"), option("long", "Более 3 месяцев")],
    textTemplate: "Зуд отмечается {{value}}.",
  },
  {
    id: "field.lesion_sites",
    key: "lesion_sites",
    label: "Локализация поражений",
    type: "multi_select",
    sectionId: "section.dermatology_history",
    options: [option("ears", "Уши"), option("face", "Морда"), option("paws", "Лапы"), option("abdomen", "Живот"), option("groin", "Пах"), option("back", "Спина")],
  },
  {
    id: "field.general_condition",
    key: "general_condition",
    label: "Общее состояние",
    type: "single_select",
    sectionId: "section.general_state",
    options: [option("satisfactory", "Удовлетворительное", "Общее состояние удовлетворительное.", true), option("moderate", "Средней тяжести", "Общее состояние средней тяжести."), option("severe", "Тяжёлое", "Общее состояние тяжёлое.")],
  },
  {
    id: "field.temperature",
    key: "temperature",
    label: "Температура",
    type: "number",
    sectionId: "section.general_state",
    unit: "°C",
    textTemplate: "Температура тела {{value}} °C.",
    frequent: true,
  },
  {
    id: "field.hydration",
    key: "hydration",
    label: "Гидратация",
    type: "single_select",
    sectionId: "section.general_state",
    options: [option("normal", "Норма", "Признаков дегидратации нет.", true), option("mild", "Снижена", "Имеются признаки дегидратации."), option("severe", "Выраженно снижена", "Дегидратация выраженная.")],
  },
  ...systemSectionFields("mucosa", "section.mucosa", "Слизистые", ["Бледность", "Гиперемия", "Иктеричность", "Цианоз"]),
  ...systemSectionFields("lymph_nodes", "section.lymph_nodes", "Лимфоузлы", ["Увеличены", "Болезненны", "Асимметричны"]),
  ...systemSectionFields("cardiovascular", "section.cardiovascular", "Сердечно-сосудистая система", ["Шум", "Аритмия", "Дефицит пульса"]),
  {
    id: "field.heart_rate",
    key: "heart_rate",
    label: "ЧСС",
    type: "number",
    sectionId: "section.cardiovascular",
    unit: "уд/мин",
    textTemplate: "ЧСС {{value}} уд/мин.",
  },
  ...systemSectionFields("respiratory", "section.respiratory", "Дыхательная система", ["Хрипы", "Одышка", "Кашель"]),
  {
    id: "field.respiratory_rate",
    key: "respiratory_rate",
    label: "ЧДД",
    type: "number",
    sectionId: "section.respiratory",
    unit: "в мин",
    textTemplate: "ЧДД {{value}} в минуту.",
  },
  ...systemSectionFields("digestive", "section.digestive_exam", "Пищеварительная система", ["Болезненность живота", "Напряжение брюшной стенки", "Изменения ротовой полости"]),
  ...systemSectionFields("skin", "section.skin_exam", "Кожа и шерсть", ["Алопеция", "Эритема", "Папулы", "Корки", "Экскориации"]),
];

function systemSectionFields(
  key: string,
  sectionId: string,
  label: string,
  changes: string[],
): ClinicalField[] {
  return [
    {
      id: `field.${key}_status`,
      key: `${key}_status`,
      label,
      type: "single_select",
      sectionId,
      options: [
        option("normal", "Без особенностей", `${label}: без особенностей.`, true),
        option("changes", "Есть изменения", `${label}: выявлены изменения.`),
      ],
    },
    {
      id: `field.${key}_changes`,
      key: `${key}_changes`,
      label: "Изменения",
      type: "multi_select",
      sectionId,
      options: changes.map((item) => option(slug(item), item)),
      clarification: { when: changes.map((item) => slug(item)), placeholder: "Описание выявленных изменений" },
    },
  ];
}

function slug(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/[^a-zа-яё0-9]+/gi, "_").replace(/^_|_$/g, "");
}

const sections: ClinicalSection[] = [
  { id: "section.housing", key: "housing", label: "Условия содержания", kind: "anamnesis", fieldIds: ["field.housing", "field.animal_contact", "field.other_animals", "field.walking"] },
  { id: "section.prevention", key: "prevention", label: "Профилактика", kind: "anamnesis", fieldIds: ["field.vaccination", "field.vaccination_date", "field.vaccine_type", "field.parasite_control"] },
  { id: "section.nutrition", key: "nutrition", label: "Питание", kind: "anamnesis", fieldIds: ["field.appetite", "field.feeding_type", "field.feeding_frequency", "field.water_intake"] },
  { id: "section.gastrointestinal", key: "gastrointestinal", label: "ЖКТ", kind: "anamnesis", fieldIds: ["field.vomiting", "field.stool"] },
  { id: "section.urinary", key: "urinary", label: "Мочевыделительная система", kind: "anamnesis", fieldIds: ["field.urination"] },
  { id: "section.reproduction", key: "reproduction", label: "Репродуктивный анамнез", kind: "anamnesis", fieldIds: ["field.neutered"] },
  { id: "section.dermatology_history", key: "dermatology_history", label: "Дерматологический анамнез", kind: "anamnesis", fieldIds: ["field.pruritus_duration", "field.lesion_sites"] },
  { id: "section.general_state", key: "general_state", label: "Общее состояние", kind: "exam", fieldIds: ["field.general_condition", "field.temperature", "field.hydration"] },
  systemSection("mucosa", "Слизистые"),
  systemSection("lymph_nodes", "Лимфоузлы"),
  systemSection("cardiovascular", "Сердечно-сосудистая система", ["field.heart_rate"]),
  systemSection("respiratory", "Дыхательная система", ["field.respiratory_rate"]),
  systemSection("digestive", "Пищеварительная система", [], "section.digestive_exam"),
  systemSection("skin", "Кожа и шерсть", [], "section.skin_exam"),
];

function systemSection(key: string, label: string, extra: string[] = [], id = `section.${key}`): ClinicalSection {
  return {
    id,
    key,
    label,
    kind: "exam",
    fieldIds: [`field.${key}_status`, `field.${key}_changes`, ...extra],
    disclosure: "system",
    statusFieldId: `field.${key}_status`,
  };
}

const templates: VisitTemplate[] = [
  template("template.general_primary.anamnesis", "Первичный общий приём", "general", "anamnesis", ["section.housing", "section.prevention", "section.nutrition", "section.gastrointestinal", "section.urinary", "section.reproduction"]),
  template("template.general_recheck.anamnesis", "Повторный приём", "general", "anamnesis", ["section.nutrition", "section.gastrointestinal", "section.urinary"]),
  template("template.dermatology.anamnesis", "Дерматологический", "dermatology", "anamnesis", ["section.dermatology_history", "section.housing", "section.prevention", "section.nutrition"]),
  template("template.gastro.anamnesis", "Гастроэнтерологический", "general", "anamnesis", ["section.nutrition", "section.gastrointestinal", "section.prevention"]),
  template("template.nutrition.anamnesis", "Диетологический", "nutrition", "anamnesis", ["section.nutrition", "section.gastrointestinal", "section.housing"]),
  template("template.general.exam", "Общий клинический осмотр", "general", "exam", ["section.general_state", "section.mucosa", "section.lymph_nodes", "section.cardiovascular", "section.respiratory", "section.digestive_exam"]),
  template("template.dermatology.exam", "Дерматологический осмотр", "dermatology", "exam", ["section.general_state", "section.mucosa", "section.lymph_nodes", "section.skin_exam"]),
  template("template.nutrition.exam", "Нутриционный осмотр", "nutrition", "exam", ["section.general_state", "section.mucosa", "section.digestive_exam", "section.skin_exam"]),
];

function template(
  id: string,
  title: string,
  specialty: EncounterSpecialty,
  documentKind: ClinicalDocumentKind,
  sectionIds: string[],
): VisitTemplate {
  return { id, title, specialty, documentKind, scope: "standard", definition: { kind: "structured", sectionIds } };
}

export const SYSTEM_CLINICAL_CATALOG: ClinicalBuilderCatalog = { fields, sections, templates };

export function createClinicalDocument(templateValue: VisitTemplate, finalText = ""): ClinicalDocument {
  const sectionFieldIds = Object.fromEntries(
    templateValue.definition.sectionIds.map((sectionId) => {
      const section = sections.find((item) => item.id === sectionId);
      return [sectionId, templateValue.definition.sectionFieldIds?.[sectionId] ?? section?.fieldIds ?? []];
    }),
  );
  return {
    version: 1,
    kind: templateValue.documentKind,
    templateId: templateValue.id,
    sectionIds: [...templateValue.definition.sectionIds],
    sectionFieldIds,
    values: [],
    finalText,
    textEdited: Boolean(finalText.trim()),
  };
}

export function defaultTemplate(specialty: EncounterSpecialty, kind: ClinicalDocumentKind): VisitTemplate {
  return templates.find((item) => item.specialty === specialty && item.documentKind === kind)
    ?? templates.find((item) => item.specialty === "general" && item.documentKind === kind)
    ?? templates[0];
}

export function adaptClinicalDocument(
  raw: unknown,
  kind: ClinicalDocumentKind,
  specialty: EncounterSpecialty,
  legacyText = "",
): ClinicalDocument {
  if (raw && typeof raw === "object") {
    const candidate = raw as Partial<ClinicalDocument>;
    if (candidate.version === 1 && candidate.kind === kind && Array.isArray(candidate.sectionIds)) {
      return {
        version: 1,
        kind,
        templateId: candidate.templateId,
        sectionIds: candidate.sectionIds,
        sectionFieldIds: candidate.sectionFieldIds ?? {},
        values: Array.isArray(candidate.values) ? candidate.values : [],
        finalText: typeof candidate.finalText === "string" ? candidate.finalText : legacyText,
        textEdited: candidate.textEdited ?? Boolean(legacyText.trim()),
      };
    }
  }
  return createClinicalDocument(defaultTemplate(specialty, kind), legacyText);
}

export function generateClinicalText(document: ClinicalDocument, catalog: ClinicalBuilderCatalog): string {
  const values = new Map(document.values.map((item) => [item.fieldId, item]));
  const paragraphs: string[] = [];
  for (const sectionId of document.sectionIds) {
    const section = catalog.sections.find((item) => item.id === sectionId);
    if (!section) continue;
    const sentences: string[] = [];
    const configuredFieldIds = document.sectionFieldIds[sectionId] ?? section.fieldIds;
    const statusValue = document.values.find((item) => item.fieldId === section.statusFieldId)?.value;
    const visibleFieldIds = section.disclosure === "system" && statusValue === "normal"
      ? configuredFieldIds.filter((fieldId) => fieldId === section.statusFieldId)
      : configuredFieldIds;
    for (const fieldId of visibleFieldIds) {
      const field = catalog.fields.find((item) => item.id === fieldId);
      const value = values.get(fieldId);
      if (!field || !value || isEmptyClinicalValue(value.value)) continue;
      const sentence = formatClinicalValue(field, value.value);
      if (sentence) sentences.push(sentence);
      if (value.note?.trim() && isClarificationActive(field, value.value)) sentences.push(`${field.label} — уточнение: ${value.note.trim()}.`);
    }
    if (sentences.length) paragraphs.push(sentences.join(" "));
  }
  return paragraphs.join("\n\n");
}

function isClarificationActive(field: ClinicalField, value: unknown): boolean {
  if (!field.clarification) return false;
  return Array.isArray(value)
    ? value.some((item) => field.clarification?.when.includes(String(item)))
    : field.clarification.when.includes(String(value));
}

function formatClinicalValue(field: ClinicalField, value: unknown): string {
  if (Array.isArray(value)) {
    const selected = (field.options ?? []).filter((item) => value.includes(item.value));
    const explicit = selected.map((item) => item.text).filter(Boolean) as string[];
    if (explicit.length) return explicit.join(" ");
    return selected.length ? `${field.label}: ${selected.map((item) => item.label.toLocaleLowerCase("ru")).join(", ")}.` : "";
  }
  const stringValue = String(value);
  const selected = field.options?.find((item) => item.value === stringValue);
  if (selected?.text) return selected.text;
  const display = selected?.label ?? stringValue;
  if (field.textTemplate) return field.textTemplate.replace("{{value}}", display);
  return `${field.label}: ${display}.`;
}

export function isEmptyClinicalValue(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function sectionCompletion(document: ClinicalDocument, section: ClinicalSection): { filled: number; total: number } {
  const fieldIds = document.sectionFieldIds[section.id] ?? section.fieldIds;
  const statusValue = document.values.find((item) => item.fieldId === section.statusFieldId)?.value;
  if (section.disclosure === "system" && statusValue === "normal") return { filled: 1, total: 1 };
  const visibleIds = section.disclosure === "system" && statusValue !== "changes"
    ? fieldIds.filter((item) => item === section.statusFieldId)
    : fieldIds;
  return {
    filled: visibleIds.filter((fieldId) => !isEmptyClinicalValue(document.values.find((item) => item.fieldId === fieldId)?.value)).length,
    total: visibleIds.length,
  };
}

export function catalogFromRecords(records: ClinicalCatalogItemRecord[]): Pick<ClinicalBuilderCatalog, "fields" | "sections"> {
  const customFields: ClinicalField[] = [];
  const customSections: ClinicalSection[] = [];
  for (const record of records) {
    if (record.kind === "field") {
      const definition = record.definition as Partial<ClinicalField>;
      customFields.push({
        id: record.uuid,
        key: record.key,
        label: record.label,
        type: definition.type ?? "text",
        sectionId: definition.sectionId ?? "section.housing",
        options: definition.options,
        unit: definition.unit,
        placeholder: definition.placeholder,
        textTemplate: definition.textTemplate,
        clarification: definition.clarification,
        frequent: definition.frequent,
        scope: record.scope,
      });
    } else {
      const definition = record.definition as Partial<ClinicalSection>;
      customSections.push({
        id: record.uuid,
        key: record.key,
        label: record.label,
        kind: definition.kind ?? "anamnesis",
        fieldIds: definition.fieldIds ?? [],
        disclosure: definition.disclosure ?? "standard",
        statusFieldId: definition.statusFieldId,
        scope: record.scope,
      });
    }
  }
  return { fields: customFields, sections: customSections };
}

export function structuredTemplatesFromRecords(records: EncounterTemplateRecord[]): VisitTemplate[] {
  return records.flatMap((record) => {
    const definition = record.definition as VisitTemplateDefinition | null;
    if (!definition || definition.kind !== "structured" || !Array.isArray(definition.sectionIds)) return [];
    if (record.section !== "anamnesis" && record.section !== "exam") return [];
    return [{
      id: record.uuid,
      title: record.title,
      specialty: record.specialty,
      documentKind: record.section,
      scope: record.scope,
      definition,
      source: record,
    }];
  });
}
