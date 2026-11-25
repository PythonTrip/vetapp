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

# Ration add catalog modal

## Implementation Status
Status: Not Started

## Description
Adding a food to the current ration opens a large centered catalog modal. The modal browses the same nutrient matrix as the catalog tab, including pages past the first 50 rows, and it keeps its own filters while it is open.

## Requirements
- Replace the body of `RationAddDialog` in `apps/clinic-web/src/features/nutrition/components/ration-add-dialog.tsx` with a centered modal about 90% of the viewport width (`w-[90vw]`), vertically centered, not the right-edge `sm:max-w-[680px]` sheet.
- The modal browse matches the catalog tab after `catalog-category-sidebar`: name search above the table, `CategoryTree`, nutrient-group tabs (`MATRIX_TABS`), the nutrient matrix, server sorting, and the empty-until-filter rule. Reuse `useFoodMatrixQuery` with `limit: 50`. Do not call the capped `foodsApi.list` / `useFoodsQuery` path for this browse.
- The footer shows **Загружено N из M** and **Загрузить ещё**. When `hasNextPage` is false, the button label is **Все загружены**. A failed next page keeps the existing visible error and a retry of `fetchNextPage`.
- The row action adds that food to the current ration through the existing `onAdd` callback. The modal does not create or edit a food and does not render `FoodEditorDialog`.
- Type chips (`SCOPE_OPTIONS`: all, ingredients, commercial foods, supplements, treats) are not in this dialog. Browse is by category, as on the catalog tab. The single category and subcategory `<select>` elements are not in this dialog.
- The modal stays open after an add. A food whose id is in `existingFoodIds` is marked and its add control is disabled. Closing is the dialog close control or the backdrop.
- Search text, category selection, and nutrient group live in component state for this dialog only. They survive nutrient-group switches while the dialog is open. Closing the dialog clears them. Opening it starts from an empty filter. This state does not read or write the catalog tab filters held by `NutritionWorkspace`.
- The same `xl` sidebar and below-`xl` **Категории** overlay from `CategoryTree` apply inside the modal.
- While nothing is selected and the search box is empty, the modal matrix stays empty and invites the clinician to pick a category or search.

## Acceptance Criteria
- **Добавить продукт** shows a centered dialog near 90% of the viewport width. The right-edge 680 px sheet, type chips, and category dropdowns are absent.
- With no category and no search text, the modal table is empty. After a category or a search, rows come from `/foods/matrix` in pages of 50. **Загружено N из M** matches the loaded rows and the page total. **Загрузить ещё** appends the next page. After the last page the button reads **Все загружены**. A failed next page shows an error and can be retried.
- Choosing a row calls `onAdd` and leaves the dialog open. A food already on the ration is marked and cannot be added again.
- Changing the modal's search, categories, or nutrient group does not change the catalog tab, and changing the catalog tab does not change the open modal. Closing the modal and opening it again starts from an empty filter.
- The modal has no food create or food edit control. At `xl` the category tree is an open 256 px column. Below `xl` it opens from **Категории** over the table.

## Dependencies
- `docs/issues/catalog-browse/catalog-category-sidebar.md` for `CategoryTree`, the counted category response, and `categorySelectionPairs` on the new subcategory node shape.

## Files Likely Touched
- `apps/clinic-web/src/features/nutrition/components/ration-add-dialog.tsx`
- `apps/clinic-web/src/features/nutrition/components/category-tree.tsx`
- `apps/clinic-web/src/features/nutrition/components/food-catalog.tsx`
- `apps/clinic-web/src/features/nutrition/hooks.ts`
- `apps/clinic-web/src/features/nutrition/api.ts`

## Implementation Steps
- [ ] Remove the sheet positioning, `SCOPE_OPTIONS` chips, category `<select>` pair, and capped `useFoodsQuery` card list from `ration-add-dialog.tsx`.
- [ ] Render a centered `DialogContent` at about 90% viewport width that composes search, `CategoryTree`, nutrient-group tabs, and the same matrix table the catalog uses.
- [ ] Drive the table with `useFoodMatrixQuery` only when a category pair or a non-empty search is set, with pages of 50, **Загружено N из M**, **Загрузить ещё**, and **Все загружены**.
- [ ] Keep the next-page error visible and retry it with `fetchNextPage`.
- [ ] Add a row action that calls `onAdd` and does not close the dialog. Disable that action when `existingFoodIds` contains the food id, and mark the row as already added.
- [ ] Store modal search, category selection, and nutrient group in the dialog, reset them when `open` becomes false, and do not connect them to the catalog tab state.
- [ ] Use the `xl` sidebar and below-`xl` **Категории** overlay inside the modal. Do not mount `FoodEditorDialog`.
- [ ] Run the checks in Verification.

## Verification
- Open **Добавить продукт** on the ration tab. Confirm the centered width, the empty state, a category filter, search, a nutrient-group switch, column sort, and a second page of 50 when more than 50 foods match.
- Add a food, confirm the dialog stays open and that food cannot be added again. Close it from the close control and from the backdrop, reopen it, and confirm the filter is empty.
- Change the catalog tab filters while the modal is closed, reopen the modal, and confirm the modal does not inherit them. Then set modal filters and confirm the catalog tab is unchanged.
- Force a failed **Загрузить ещё** request and confirm the error stays visible and a second press retries the next page.
- Run `pnpm --filter vetdietderm-web check` from the repository root.
