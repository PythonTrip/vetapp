---
source_prd: docs/prd/2026-11-25_catalog-browse_prd.md
prd_id: 2026-11-25-catalog-browse
cycle_id: 2026-11-25-catalog-browse
cycle_slug: catalog-browse
project_doc: docs/PROJECT.md
status: Done
complexity: S
criticality: Blocker
---

# Incomplete ration total

## Implementation Status
Status: Done

## Description
When a ration nutrient is only partly known, the **Итого** / **Рацион** cell shows the known lower bound instead of an empty total. The bound is the sum of per-food contributions that already have a daily amount. Normative status, snapshot freeze, and the kcal summary stay as they are.

## Requirements
- In `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.tsx`, add a helper that reads one assessment row and returns the known lower bound only for an additive total whose complete **Итого** cell already displays `ration_daily_amount`. That is the `per_day` branch of `rowComparisonAmount`, and the default branch when it falls through to `ration_daily_amount`.
- The known amount is the sum of `row.contributions` entries whose `daily_amount` is not null, in that same unit. Omit null contributions. Do not treat a missing food as zero inside the sum. When the row is `missing_product_data` and every contribution is missing, or the contributions list is empty, the known amount is 0.
- Return no lower bound when `rowComparisonAmount` would display `ration_ratio`, `per_1000_kcal_me`, `per_100g_as_fed`, `per_100g_dry_matter`, `per_kg_bw`, or `per_kg_metabolic_bw`. Those cells keep their current unevaluable presentation. A ratio is not given a `≥` label.
- When the helper returns a number and the complete comparable amount is null, the **Итого** cell text is `≥` plus `formatNumber(known, 2)`. This is the same `≥` prefix `targetValueText` already uses for a minimum. Do not show the `?` status symbol in that cell. `≥ 0` is the all-missing case. Format 0 with the same `formatNumber` call.
- When the complete comparable amount is present, the cell stays a plain `formatNumber(value, 2)` with no `≥` and no `?`.
- Do not change `STATUS` labels, row color classes, `above_maximum` / `below_minimum` backgrounds, or whether the norm is met. An existing `above_maximum` result that the server already raises from the known part keeps its red background. This label does not create a new status.
- Do not change the assessment engine, the status enum, `input_hash`, diet-plan snapshot freeze, or FEDIAF provider selection. The client only sums `daily_amount` values the assessment already returns.
- Leave food-row cells on `formatNumber`, so a missing food cell stays `—` and a known zero stays zero.
- Leave the kcal summary above the table unchanged, including the **ME неполная** line that prints `known_kcal_day`.

## Acceptance Criteria
- An additive `per_day` nutrient with some null contributions and some numeric `daily_amount` values shows `≥` and the sum of the numeric values in the **Итого** / **Рацион** cell. The `?` symbol is absent from that cell.
- The same cell shows `≥ 0` when every contribution for that additive row is missing.
- A complete additive total shows the plain number, with no `≥` and no `?`.
- A ratio row, and a row whose complete cell uses `per_1000_kcal_me`, dry matter, or a per-kilogram basis, keeps the current `?` and `—` presentation when it is unevaluable.
- Food rows still show `—` for a missing amount and `0` for a known zero. Status color and the above-maximum background still follow the server status. The kcal summary above the table is unchanged.
- Saved diet-plan snapshots and the assessment status enum are unchanged.

## Dependencies
None. The known amount is the sum of `contributions[].daily_amount` values the current assessment response already returns.

## Files Likely Touched
- `apps/clinic-web/src/features/nutrition/components/nutrition-workspace.tsx`

## Implementation Steps
- [ ] Add a helper next to `rowComparisonAmount` in `nutrition-workspace.tsx` that sums non-null `contributions[].daily_amount` for additive `per_day` rows and returns 0 when that row is `missing_product_data` with no numeric contributions.
- [ ] Make the helper return no bound for ratio rows and for bases other than the daily sum.
- [ ] In the **Итого** / **Рацион** cell, when the helper returns a number and the complete amount is null, render `≥` and `formatNumber(known, 2)` without the status symbol.
- [ ] Keep a complete amount as a plain number. Keep the existing status color classes on the cell.
- [ ] Leave food-row `formatNumber` cells and the kcal summary block above the table unchanged.
- [ ] Run the checks in Verification.

## Verification
- Build a ration where one food has a value for an additive daily nutrient and another food does not. Confirm the **Итого** cell reads `≥` plus the known food's amount, the missing food cell is `—`, and the cell has no `?`.
- Remove every value for that nutrient and confirm the cell reads `≥ 0`. Complete the values and confirm the cell is a plain number.
- Open an unevaluable ratio column and confirm it still shows the current `?` and `—` presentation. Confirm the kcal line above the table still shows its current text, including **ME неполная** when ME is incomplete.
- Confirm a known partial total that the server marks `above_maximum` still uses the red background and does not gain a new status label.
- Run `pnpm --filter vetdietderm-web check` from the repository root.
