import type { FoodCategoryGroupRecord, FoodCategoryPair } from "@/features/nutrition/api";

export type CategorySelection = Map<string | null, Set<string | null>>;

export function categoryCheckState(
  group: FoodCategoryGroupRecord,
  selected: ReadonlySet<string | null> | undefined,
): boolean | "indeterminate" {
  if (!selected) return false;
  if (group.subcategories.every(({ subcategory }) => selected.has(subcategory))) return true;
  return group.subcategories.some(({ subcategory }) => selected.has(subcategory))
    ? "indeterminate"
    : false;
}

export function categorySelectionPairs(
  selection: CategorySelection,
  groups: FoodCategoryGroupRecord[] = [],
): FoodCategoryPair[] {
  const groupsByCategory = new Map(groups.map((group) => [group.category, group]));

  return Array.from(selection, ([category, subcategories]) => {
    const group = groupsByCategory.get(category);
    if (group && categoryCheckState(group, subcategories) === true) {
      return [{ category, subcategory: null, allSubcategories: true }];
    }
    return Array.from(subcategories, (subcategory) => ({ category, subcategory }));
  }).flat();
}

export function categoryLabel(category: string | null): string {
  return category ?? "Без категории";
}

export function subcategoryLabel(subcategory: string | null): string {
  return subcategory ?? "Без подкатегории";
}
