---
source_prd: docs/prd/2026-11-25_catalog-browse_prd.md
prd_id: 2026-11-25-catalog-browse
cycle_id: 2026-11-25-catalog-browse
cycle_slug: catalog-browse
project_doc: docs/PROJECT.md
status: Done
complexity: S
criticality: High
---

# Catalog filter chrome

## Implementation Status
Status: Done

## Description
The catalog tab retires the horizontal category panel and its per-category popovers. Search, the nutrient matrix, sorting, paging, and food create and edit stay on that tab. The clear control is **Сбросить**.

## Requirements
- Remove `CategoryPanel` from `apps/clinic-web/src/features/nutrition/components/food-catalog.tsx`. The catalog tab must not render the horizontal chip bar or a per-category popover.
- Delete `apps/clinic-web/src/features/nutrition/components/category-panel.tsx` after `categoryLabel`, `subcategoryLabel`, `categorySelectionPairs`, and `CategorySelection` live in `apps/clinic-web/src/features/nutrition/components/category-selection.ts`. `category-tree.tsx`, `food-catalog.tsx`, and `ration-add-dialog.tsx` import those symbols from that module. Do not leave a second category-selection implementation.
- The clear control above the table has the visible label **Сбросить**. It clears category selection and the search text, using the state lifted in `catalog-category-sidebar`. There is no control labeled **Очистить всё**.
- One active-filter chip still removes only that filter: the search chip clears the search text, and a category chip clears that category or subcategory.
- Keep on the catalog tab: the name-search box, the nutrient matrix, nutrient-group tabs, column sorting, the 50-row page, the **Загрузить ещё** / **Все загружены** footer, food create, and food edit through `FoodEditorDialog`.
- Do not add food create or food edit to the ration modal in this issue.

## Acceptance Criteria
- The catalog tab has no horizontal category chip bar and no per-category popover. `category-panel.tsx` is gone, and no file imports it.
- The clear control reads **Сбросить** and clears both category selection and search text. A single chip removes only its own filter.
- Search, nutrient-group tabs, column sorting, **Загружено N из M**, **Загрузить ещё**, food create, and food edit still work on the catalog tab.
- The category tree from `catalog-category-sidebar` is still the browse control on that tab.

## Dependencies
- `docs/issues/catalog-browse/catalog-category-sidebar.md` so the tree, counted categories, and lifted filter state are already on the catalog tab before the old panel is deleted.

## Files Likely Touched
- `apps/clinic-web/src/features/nutrition/components/food-catalog.tsx`
- `apps/clinic-web/src/features/nutrition/components/category-panel.tsx`
- `apps/clinic-web/src/features/nutrition/components/category-selection.ts`
- `apps/clinic-web/src/features/nutrition/components/category-tree.tsx`
- `apps/clinic-web/src/features/nutrition/components/ration-add-dialog.tsx`

## Implementation Steps
- [x] Move `categoryLabel`, `subcategoryLabel`, `categorySelectionPairs`, and `CategorySelection` from `category-panel.tsx` into `category-selection.ts`, and update imports in `category-tree.tsx`, `food-catalog.tsx`, and `ration-add-dialog.tsx`.
- [x] Delete `category-panel.tsx` and remove every `CategoryPanel` render and import.
- [x] Change the clear button label from **Очистить всё** to **Сбросить**, and keep its handler clearing search text and category selection.
- [x] Confirm a search chip and a category chip each remove only that filter.
- [x] Confirm the catalog tab still opens food create and food edit, and still sorts, pages, and loads the next 50 rows.
- [x] Run the checks in Verification.

## Verification
- On `/nutrition` → **Каталог**, confirm the horizontal category bar and its popovers are absent, the tree is present, and the clear button reads **Сбросить**.
- Set a search and a category, then remove each chip separately and press **Сбросить**. Confirm each action clears only what it owns, and **Сбросить** clears both.
- Create a food, edit a food, switch a nutrient group, sort a column, and load a second page. Confirm each still works on the catalog tab.
- Search the clinic web source for `category-panel` and **Очистить всё** and confirm neither remains.
- Run `pnpm --filter vetdietderm-web check` from the repository root.
