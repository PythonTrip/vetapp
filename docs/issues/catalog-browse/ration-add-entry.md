---
source_prd: docs/prd/2026-11-25_catalog-browse_prd.md
prd_id: 2026-11-25-catalog-browse
cycle_id: 2026-11-25-catalog-browse
cycle_slug: catalog-browse
project_doc: docs/PROJECT.md
status: Not Started
complexity: S
criticality: High
---

# Ration add entry

## Implementation Status
Status: Not Started

## Description
**Добавить продукт** on the ration tab opens the catalog modal. The clinician can add several foods without closing it, and a food already on the ration cannot be added again. The sheet's type chips and single category dropdowns are gone.

## Requirements
- The **Добавить продукт** button in `RationWorkbench` inside `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.tsx` opens the modal implemented in `ration-add-catalog-modal`. It stays disabled when the ration is read-only (`historicalSnapshotLocked`).
- `addFood` appends `{ food, grams: "100" }` when that `food.uuid` is not already in `lines`, then calls `invalidateAssessment()`. It does not call `setRationAddOpen(false)`.
- Pass `existingFoodIds={lines.map((line) => line.food.uuid)}` into the dialog so a duplicate stays disabled inside the modal.
- The dialog that button opens must not contain `SCOPE_OPTIONS`, the treats scope, the type chips, or the single category and subcategory `<select>` elements. It must not use the right-edge `sm:max-w-[680px]` sheet classes.
- Do not change diet-plan save, patient selection, or the catalog tab's create and edit dialogs.

## Acceptance Criteria
- Pressing **Добавить продукт** on the ration tab opens the centered catalog modal and does not open a 680 px right-edge sheet.
- Adding one food leaves the modal open. Adding a second food appends another line at 100 g. The first food is marked and cannot be added again.
- The modal has no type chips and no single category or subcategory dropdown.
- A read-only historical snapshot keeps **Добавить продукт** disabled.
- Closing the modal is still the close control or the backdrop, from the modal issue. This entry does not close it on add.

## Dependencies
- `docs/issues/catalog-browse/ration-add-catalog-modal.md` so the dialog body is the paged catalog matrix before this entry is checked.

## Files Likely Touched
- `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.tsx`
- `apps/clinic-web/src/features/nutrition/components/ration-add-dialog.tsx`
- `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.test.tsx`

## Implementation Steps
- [ ] Keep the **Добавить продукт** button calling `onOpenAdd` and `setRationAddOpen(true)`, and keep it disabled when `readOnly` is true.
- [ ] Keep `addFood` from closing the dialog and from appending a duplicate `food.uuid`.
- [ ] Keep `existingFoodIds` wired from `lines` to `RationAddDialog`.
- [ ] Delete any remaining `SCOPE_OPTIONS`, type-chip row, category `<select>`, subcategory `<select>`, and `sm:max-w-[680px]` sheet classes from `ration-add-dialog.tsx`.
- [ ] Update `nutrition-workspace.test.tsx` only where it still looks for the sheet chips or the capped card list, so the button still opens the dialog.
- [ ] Run the checks in Verification.

## Verification
- On `/nutrition` → **Рацион**, press **Добавить продукт**, add two different foods, and confirm both lines appear at 100 g while the modal stays open and the first food cannot be added again.
- Confirm the open dialog has no type chips, no category dropdown, and is not docked to the right edge at 680 px.
- Open a saved historical plan that locks the workspace and confirm **Добавить продукт** is disabled.
- Run `pnpm --filter vetdietderm-web check` from the repository root.
