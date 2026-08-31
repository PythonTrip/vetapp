import type { NutrientCategory } from "@/lib/api-client";

export type CanonicalNutrientGroup = "control" | "main" | "mineral" | "vitamin";

export type NutrientColumnDefinition = {
  code: string;
  name: string;
  unit: string;
};

export const NUTRIENT_COLUMNS: Record<CanonicalNutrientGroup, readonly NutrientColumnDefinition[]> = {
  control: [
    { code: "ME/DM", name: "Обменная энергия в сухом веществе", unit: "" },
    { code: "CP/ME", name: "Сырой протеин на 1000 ккал ME", unit: "" },
    { code: "CP/DM", name: "Сырой протеин в сухом веществе", unit: "%" },
    { code: "CH/DM", name: "Углеводы в сухом веществе", unit: "%" },
    { code: "CFa/DM", name: "Сырой жир в сухом веществе", unit: "%" },
    { code: "CFi/DM", name: "Сырая клетчатка в сухом веществе", unit: "%" },
    { code: "CAs/DM", name: "Сырая зола в сухом веществе", unit: "%" },
    { code: "Ca/P", name: "Соотношение кальция и фосфора", unit: "" },
    { code: "Zn/Ca", name: "Соотношение цинка и кальция", unit: "" },
    { code: "CAB", name: "Катионно-анионный баланс", unit: "" },
    { code: "pH", name: "Кислотность", unit: "ед" },
    { code: "ω6/ω3", name: "Соотношение омега-6 и омега-3", unit: "" },
  ],
  main: [
    { code: "ME", name: "Обменная энергия", unit: "ккал / 100 г" },
    { code: "CP", name: "Сырой протеин", unit: "г" },
    { code: "CFa", name: "Сырой жир", unit: "г" },
    { code: "CFi", name: "Сырая клетчатка", unit: "г" },
    { code: "CAs", name: "Сырая зола", unit: "г" },
    { code: "CH", name: "Углеводы", unit: "г" },
    { code: "MO", name: "Влага", unit: "г" },
    { code: "DM", name: "Сухое вещество", unit: "г" },
  ],
  mineral: [
    { code: "Ca", name: "Кальций", unit: "мг" },
    { code: "P", name: "Фосфор", unit: "мг" },
    { code: "Mg", name: "Магний", unit: "мг" },
    { code: "Na", name: "Натрий", unit: "мг" },
    { code: "K", name: "Калий", unit: "мг" },
    { code: "Cl", name: "Хлор", unit: "мг" },
    { code: "Fe", name: "Железо", unit: "мг" },
    { code: "Cu", name: "Медь", unit: "мг" },
    { code: "Zn", name: "Цинк", unit: "мг" },
    { code: "Mn", name: "Марганец", unit: "мг" },
    { code: "Se", name: "Селен", unit: "мкг" },
    { code: "J", name: "Йод", unit: "мкг" },
  ],
  vitamin: [
    { code: "A", name: "Витамин A", unit: "МЕ" },
    { code: "D", name: "Витамин D", unit: "МЕ" },
    { code: "E", name: "Витамин E", unit: "МЕ" },
    { code: "B1", name: "Витамин B1", unit: "мг" },
    { code: "B2", name: "Витамин B2", unit: "мг" },
    { code: "B3", name: "Витамин B3", unit: "мг" },
    { code: "B4", name: "Витамин B4", unit: "мг" },
    { code: "B5", name: "Витамин B5", unit: "мг" },
    { code: "B6", name: "Витамин B6", unit: "мг" },
    { code: "B7", name: "Витамин B7", unit: "мкг" },
    { code: "B9", name: "Витамин B9", unit: "мкг" },
    { code: "B12", name: "Витамин B12", unit: "мкг" },
    { code: "C", name: "Витамин C", unit: "мг" },
  ],
};

const CODE_ALIASES: Record<string, string> = {
  "Ca:P": "Ca/P",
  omega6_omega3: "ω6/ω3",
};

const COLUMN_BY_CODE = new Map(
  Object.values(NUTRIENT_COLUMNS).flat().map((column) => [column.code, column]),
);

export function canonicalNutrientCode(code: string): string {
  return CODE_ALIASES[code] ?? code;
}

export function nutrientColumnDefinition(code: string): NutrientColumnDefinition | undefined {
  return COLUMN_BY_CODE.get(canonicalNutrientCode(code));
}

export function nutrientDisplayUnit(code: string, fallbackUnit = ""): string {
  const canonical = nutrientColumnDefinition(code)?.unit;
  if (canonical !== undefined) return canonical;
  if (fallbackUnit === "g") return "г";
  if (fallbackUnit === "mg") return "мг";
  if (fallbackUnit === "mcg") return "мкг";
  if (fallbackUnit === "IU") return "МЕ";
  return fallbackUnit;
}

export function orderedNutrients<T extends { code: string }>(
  nutrients: readonly T[],
  group: CanonicalNutrientGroup,
): T[] {
  const byCode = new Map(nutrients.map((nutrient) => [canonicalNutrientCode(nutrient.code), nutrient]));
  return NUTRIENT_COLUMNS[group]
    .map((column) => byCode.get(column.code))
    .filter((nutrient): nutrient is T => nutrient !== undefined);
}

export function canonicalGroupForCategory(
  category: NutrientCategory,
): CanonicalNutrientGroup | undefined {
  if (category === "main" || category === "mineral" || category === "vitamin") return category;
  return undefined;
}
