---
source_prd: docs/prd/2026-11-25_catalog-browse_prd.md
prd_id: 2026-11-25-catalog-browse
cycle_id: 2026-11-25-catalog-browse
cycle_slug: catalog-browse
project_doc: docs/PROJECT.md
status: Not Started
complexity: M
criticality: Blocker
---

# Catalog category sidebar

## Implementation Status
Status: Not Started

## Description
The catalog tab on **Расчёт рациона** replaces the horizontal category chip bar with a collapsible category tree. Each node shows how many foods sit in that branch of the stored catalog, and the nutritionist filters the existing nutrient matrix by selected category and subcategory pairs.

## Requirements
- Extend `FoodCategoryGroup` in `apps/api/src/vetdietderm_api/catalog/schemas.py` so `GET /foods/categories` returns a food count for every category and every subcategory. Keep `category: str | None`. Replace `subcategories: list[str | None]` with a list of nodes `{ subcategory: str | None, food_count: int }`, and add `food_count: int` on the category. `food_count` is the number of `foods` rows in that node, not a count of nutrient rows. A category count is the number of foods with that `foods.category`. A subcategory count is the number of foods with that category and `foods.subcategory` pair. Counts describe the whole stored catalog and do not change when the name-search box changes.
- Compute those counts in `list_food_categories` in `apps/api/src/vetdietderm_api/catalog/repository.py` with one grouped count over `foods.category` and `foods.subcategory`. Keep the current null-last, case-insensitive sort. Do not add a browse taxonomy and do not add an Alembic migration.
- Regenerate `packages/api-contract` with `pnpm api:generate` so `/foods/categories` and `/v1/staff/foods/categories` both expose the new fields. Update every TypeScript reader of `FoodCategoryGroupRecord.subcategories` (`category-panel.tsx`, `food-catalog.tsx`, `ration-add-dialog.tsx`) to read `node.subcategory` and `node.food_count`. Update the category assertion in `apps/api/tests/integration/test_nutrition_workflow.py` to the new shape, including `food_count`.
- Add `apps/clinic-web/src/features/nutrition/components/category-tree.tsx`. The tree lists the categories and subcategories already stored on foods. A null category is labeled **Без категории**. A null subcategory is labeled **Без подкатегории**. A category whose subcategory list is empty is one checkbox with no children.
- Each node is a tri-state checkbox: selected, partial, or clear. Choosing a parent selects all of its subcategories. Choosing a fully selected parent clears that branch. Choosing a partial parent selects the remaining children. A full child set shows the parent as selected. A partial child set shows the parent as partial.
- Several branches can be expanded at once. Expanding or collapsing a branch does not change selection. All branches start collapsed. There is no search field inside the tree.
- The sidebar is 256 px wide (`w-64`) and scrolls vertically on its own. Rows stay compact, nesting is indented, and selected rows are visually distinct.
- On the `xl` layout (1280 px and up, the catalog layout's existing wide breakpoint), the tree starts open. A control in the sidebar header hides the column and gives the table the freed width. That collapsed state lasts while `/nutrition` stays mounted and resets when the clinician leaves the page or reloads the browser.
- Below `xl`, a **Категории** button opens the same tree over the table and a close control dismisses it.
- Each node shows its `food_count` from the category response. The name-search box does not change those counts.
- Filtering applies on the existing `useFoodMatrixQuery` path. A food matches when its category and subcategory pair is any selected pair (OR). When search text is also present, it still narrows that set. Reuse `categorySelectionPairs` so a fully selected parent is sent as `allSubcategories`.
- Above the table, show the active category filters and the search chip, plus **Сбросить**. **Сбросить** clears category selection and the search text. One chip removes only that filter.
- Keep the existing **Найдено** count, and make it reflect the current filter.
- Category selection and search survive nutrient-group switches and survive switching the **Рацион**, **Недавние планы**, and **Каталог** tabs. Leaving `/nutrition` or reloading the browser starts from an empty filter. Do not write the filter to `localStorage` or the URL. Lift the selection and search state to `NutritionWorkspace` in `nutrition-workspace.tsx`, because `TabsContent` unmounts the catalog tab.
- While nothing is selected and the search box is empty, the matrix stays empty and still invites the clinician to pick a category or search.
- On the catalog tab, render `CategoryTree` in place of `CategoryPanel`. Do not delete `category-panel.tsx` in this issue.

## Acceptance Criteria
- `GET /foods/categories` returns `food_count` on each category and each subcategory node, and those numbers match the stored food rows for that node. A name search on the catalog tab does not change the numbers.
- On `/nutrition` → **Каталог** at `xl` and wider, the 256 px tree is open, the horizontal `CategoryPanel` is not rendered, and the header control hides the column until the page is left or reloaded.
- Below `xl`, the tree is closed until **Категории** is pressed, then it overlays the table and can be closed.
- Parent and child checkboxes stay consistent in both directions. Expand and collapse do not change which foods match. All branches start collapsed, and more than one branch can stay open.
- Selecting two branches shows foods from either pair. **Сбросить** clears selection and search. Removing one chip leaves the other filters. **Найдено** matches the filtered matrix total.
- Switching nutrient groups or workspace tabs on `/nutrition` keeps the selection and search. A browser reload starts from an empty filter and an empty table with the existing invitation to pick a category or search.
- A category with an empty subcategory list is a single checkbox. **Без категории** and **Без подкатегории** appear when those nulls exist in `foods`.

## Dependencies
None. Wide layout means the existing Tailwind `xl` breakpoint at 1280 px. The category response shape above is the cycle contract for this read model.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/catalog/schemas.py`
- `apps/api/src/vetdietderm_api/catalog/repository.py`
- `apps/api/src/vetdietderm_api/catalog/router.py`
- `apps/api/tests/integration/test_nutrition_workflow.py`
- `packages/api-contract/src/generated.ts`
- `apps/clinic-web/src/features/nutrition/api.ts`
- `apps/clinic-web/src/features/nutrition/components/category-tree.tsx`
- `apps/clinic-web/src/features/nutrition/components/category-panel.tsx`
- `apps/clinic-web/src/features/nutrition/components/food-catalog.tsx`
- `apps/clinic-web/src/features/nutrition/components/ration-add-dialog.tsx`
- `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.tsx`

## Implementation Steps
- [ ] Add `food_count` and subcategory nodes to `FoodCategoryGroup` in `apps/api/src/vetdietderm_api/catalog/schemas.py`.
- [ ] Change `list_food_categories` in `apps/api/src/vetdietderm_api/catalog/repository.py` to return grouped `count(*)` values for each category and subcategory pair, preserving null-last case-insensitive order.
- [ ] Run `pnpm api:generate` from the repository root and confirm `pnpm api:check` passes.
- [ ] Update the `/foods/categories` assertion in `apps/api/tests/integration/test_nutrition_workflow.py` so each category has `food_count` and each subcategory is `{ subcategory, food_count }`.
- [ ] Point `FoodCategoryGroupRecord` readers in `category-panel.tsx`, `food-catalog.tsx`, and `ration-add-dialog.tsx` at `node.subcategory` and `node.food_count`.
- [ ] Create `category-tree.tsx` with tri-state selection, independent expand state, 256 px scrolling rows, per-node counts, and no in-tree search field.
- [ ] Lift catalog search text and category selection into `NutritionWorkspace` and pass them into `FoodCatalog` so they survive tab switches inside `/nutrition` and clear on leave or reload.
- [ ] Render `CategoryTree` in place of `CategoryPanel` on the catalog tab, with the `xl` sidebar and the below-`xl` **Категории** overlay.
- [ ] Keep immediate OR filtering through `categorySelectionPairs` and `useFoodMatrixQuery`, the active-filter chips, **Сбросить**, **Найдено**, and the empty-until-filter invitation.
- [ ] Run the checks in Verification.

## Verification
- Call `GET /foods/categories` and compare each `food_count` with the number of `foods` rows in that category or subcategory. Repeat after typing in the catalog search box and confirm the counts stay the same.
- On `/nutrition` → **Каталог**, select a parent, a partial child set, and two branches. Confirm the matrix, **Найдено**, chips, and **Сбросить** match the rules above. Collapse the sidebar at `xl`, open **Категории** below `xl`, switch nutrient groups and workspace tabs, then reload and confirm the filter resets.
- Run `pnpm api:check` and `pnpm --filter vetdietderm-web check` from the repository root.
