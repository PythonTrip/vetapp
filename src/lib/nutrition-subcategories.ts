import catalog from "../../scripts/data/catalog.json";

interface CatalogNode {
  name: string;
  data?: CatalogNode[];
}

const categories = ((catalog as CatalogNode[])[0]?.data ?? []);

export function getNutritionSubcategories(category: string) {
  const categoryKey = category.toLocaleLowerCase("ru-RU");
  const match = categories.find(
    (item) => item.name.toLocaleLowerCase("ru-RU") === categoryKey,
  );

  return Array.from(new Set((match?.data ?? []).map((item) => item.name)));
}

export function getCatalogSubcategory(category: string, subcategory: unknown) {
  if (typeof subcategory !== "string" || !subcategory.trim()) return null;

  const subcategoryKey = subcategory.trim().toLocaleLowerCase("ru-RU");
  return getNutritionSubcategories(category).find(
    (name) => name.toLocaleLowerCase("ru-RU") === subcategoryKey,
  ) ?? null;
}
