export const NUTRITION_CATEGORIES = [
  "белки",
  "углеводы",
  "жиры",
  "клетчатка",
  "сухие корма",
  "влажные корма",
  "добавки",
  "лакомства",
] as const;

export type NutritionCategory = (typeof NUTRITION_CATEGORIES)[number];

export const NUTRIENT_GROUPS = [
  {
    id: "control",
    label: "Контрольные",
    codes: ["ME/DM", "CP/ME", "CP/DM", "CH/DM", "CFa/DM", "CFi/DM", "CAs/DM", "Ca/P", "Zn/Ca", "ω6/ω3"],
  },
  {
    id: "main",
    label: "Основные",
    codes: ["ME", "CP", "CFa", "CFi", "CAs", "CH", "MO", "DM"],
  },
  {
    id: "minerals",
    label: "Минералы",
    codes: ["Ca", "P", "Mg", "Na", "K", "Cl", "Fe", "Cu", "Zn", "Mn", "Se", "J"],
  },
  {
    id: "vitamins",
    label: "Витамины",
    codes: ["A", "D", "E", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B9", "B12", "C"],
  },
  {
    id: "amino-acids",
    label: "Аминокислоты",
    codes: ["His", "Phe", "Tau", "Thr", "Trp", "Tyr", "Val", "Met", "Ile", "Lys", "Arg", "Leu", "Cys"],
  },
  {
    id: "fatty-acids",
    label: "Жирные кислоты",
    codes: ["LA", "ALA", "AA", "EPA", "DHA"],
  },
] as const;

export const NUTRIENT_CODES: readonly string[] = Array.from(
  new Set(NUTRIENT_GROUPS.flatMap((group) => [...group.codes])),
);

export const NUTRIENT_UNITS: Record<string, string> = {
  "ME/DM": "ккал/кг",
  "CP/ME": "г/1000 ккал",
  "CP/DM": "%",
  "CH/DM": "%",
  "CFa/DM": "%",
  "CFi/DM": "%",
  "CAs/DM": "%",
  ME: "ккал/кг",
  CP: "%",
  CFa: "%",
  CFi: "%",
  CAs: "%",
  CH: "%",
  MO: "%",
  DM: "%",
  // Minerals — per 100 g as-fed
  Ca: "мг", P: "мг", Mg: "мг", Na: "мг", K: "мг", Cl: "мг",
  Fe: "мг", Cu: "мг", Zn: "мг", Mn: "мг", Se: "мкг", J: "мкг",
  // Vitamins — per 100 g as-fed
  A: "МЕ", D: "МЕ", E: "мг", C: "мг",
  B1: "мг", B2: "мг", B3: "мг", B4: "мг", B5: "мг", B6: "мг",
  B7: "мкг", B9: "мкг", B12: "мкг",
  // Amino & fatty acids — per 100 g as-fed
  His: "г", Phe: "г", Tau: "г", Thr: "г", Trp: "г", Tyr: "г", Val: "г",
  Met: "г", Ile: "г", Lys: "г", Arg: "г", Leu: "г", Cys: "г",
  LA: "г", ALA: "г", AA: "г", EPA: "г", DHA: "г",
};

export interface NutritionProductNutrientDto {
  code: string;
  value: number;
  calculated: boolean;
}

export interface NutritionProductDto {
  id: number;
  name: string;
  category: string;
  subcategory: string | null;
  nutrients: NutritionProductNutrientDto[];
}

export interface NutritionSubcategoryDto {
  name: string;
  count: number;
}

export interface NutritionProductsResponse {
  products: NutritionProductDto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  categoryCounts: Record<string, number>;
  subcategories: NutritionSubcategoryDto[];
}
