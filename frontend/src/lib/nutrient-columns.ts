import type { NutrientCategory } from "@/lib/api-client";

export type CanonicalNutrientGroup = "control" | "main" | "mineral" | "vitamin";

export type NutrientColumnDefinition = {
  code: string;
  name?: string;
  unit?: string;
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
    { code: "ME" },
    { code: "CP" },
    { code: "CFa" },
    { code: "CFi" },
    { code: "CAs" },
    { code: "CH" },
    { code: "MO" },
    { code: "DM" },
  ],
  mineral: [
    { code: "Ca" },
    { code: "P" },
    { code: "Mg" },
    { code: "Na" },
    { code: "K" },
    { code: "Cl" },
    { code: "Fe" },
    { code: "Cu" },
    { code: "Zn" },
    { code: "Mn" },
    { code: "Se" },
    { code: "I" },
  ],
  vitamin: [
    { code: "A" },
    { code: "D" },
    { code: "E" },
    { code: "B1" },
    { code: "B2" },
    { code: "B3" },
    { code: "B4" },
    { code: "B5" },
    { code: "B6" },
    { code: "B7" },
    { code: "B9" },
    { code: "B12" },
    { code: "C" },
  ],
};

const CODE_ALIASES: Record<string, string> = {
  J: "I",
  "Ca:P": "Ca/P",
  omega6_omega3: "ω6/ω3",
};

export function canonicalNutrientCode(code: string): string {
  return CODE_ALIASES[code] ?? code;
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
