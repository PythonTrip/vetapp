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

# Ration total label

## Implementation Status
Status: Not Started

## Description
The **Итого** / **Рацион** cell no longer shows `?—` for an incomplete additive total. Status colors and the nutrient detail dialog stay. A missing food cell stays blank.

## Requirements
- In the **Итого** row of `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.tsx`, an incomplete additive total uses the lower-bound text from `incomplete-ration-total`. The visible text does not concatenate the `?` symbol from `STATUS` with `—`.
- Do not render `status.symbol` in that cell when the lower bound is shown. The cell text is `≥` plus the formatted known amount, or the plain number when the total is complete.
- Keep the cell's status color classes: `status.className`, the `above_maximum` red background, the `below_minimum` amber background, and the unevaluable violet background from `isUnevaluableStatus`.
- The cell button still opens the nutrient detail dialog (`setSelectedNutrientKey`). That dialog still shows the status label, `Поступление` when `ration_daily_amount` is present, the target, and the other bases. Do not add a `≥` label inside the dialog.
- A food-row cell with a null amount stays `—`. A known zero stays `0` through `formatNumber`. Do not fill missing food cells with `≥`.
- Do not change the **Цель** row, the kcal summary above the table, or the assessment status enum.

## Acceptance Criteria
- No **Итого** / **Рацион** cell displays `?—`. An incomplete additive daily total displays `≥` and the known amount. A complete total displays the plain number.
- The incomplete cell still uses the status color for `missing_product_data`, `below_minimum`, or `above_maximum`. Pressing the cell still opens the nutrient detail dialog, and that dialog still shows the status label rather than a `≥` prefix.
- A missing food cell in the same column is `—`. A food cell whose amount is zero is `0`.
- An unevaluable ratio cell may still show its current `?` and `—` presentation. That presentation is not copied onto additive incomplete totals.

## Dependencies
- `docs/issues/catalog-browse/incomplete-ration-total.md` so the known-amount helper and the `≥` cell text exist before this label check.

## Files Likely Touched
- `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.tsx`

## Implementation Steps
- [ ] In the **Итого** / **Рацион** cell, stop rendering `STATUS[row.status].symbol` when the incomplete-ration helper returns a lower bound.
- [ ] Render that cell as `≥` plus `formatNumber(known, 2)` when the complete amount is null, and as the plain number when the complete amount is present.
- [ ] Leave the `className` color and background conditions on that `<td>` unchanged.
- [ ] Leave the detail-dialog button, the dialog body, the **Цель** row, food-row cells, and the kcal summary unchanged.
- [ ] Run the checks in Verification.

## Verification
- Build an incomplete additive ration and read the **Итого** cell. Confirm it shows `≥` and the known amount, and that the characters `?—` are absent.
- Confirm the cell color still matches the row status, including red when the server status is `above_maximum`.
- Activate the cell and confirm the nutrient detail dialog opens with the status label and without a `≥` prefix in the dialog body.
- Confirm a missing food cell in that column is `—` and a stored zero is `0`.
- Run `pnpm --filter vetdietderm-web check` from the repository root.
