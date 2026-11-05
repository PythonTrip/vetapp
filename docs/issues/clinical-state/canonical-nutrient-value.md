---
source_prd: docs/audit/2026-11-01-audit.md
prd_id: 2026-11-01-clinical-state
cycle_id: 2026-11-01-clinical-state
cycle_slug: clinical-state
project_doc: docs/PROJECT.md
status: Done
---

# Canonical Nutrient Value

## Implementation Status
Status: Done

## Description
A food can store more than one `FoodNutrientValue` for the same nutrient and basis because uniqueness includes `source_uuid`. The catalog matrix keeps the newest `updated_at`. Assessment loads those rows without an order and lets the last row overwrite the dictionary, so a ration can use an older value than the matrix shows. The food-detail energy line has the same split: it keeps the first matching ME row from an unordered list. Display, energy preview, and assessment need one shared choice, and saved plan snapshots stay frozen.

## Requirements
- For one food, nutrient, and basis, the canonical row is the greatest `updated_at`. When `updated_at` ties, the greatest `uuid` wins.
- Use that rule in `list_food_matrix` for both the sort subquery and the page value query in `apps/api/src/vetdietderm_api/catalog/repository.py`.
- Use that rule in `serialize_nutrient_values` so each `(code, basis)` appears once. Keep `source_uuid` and `value_status` from the winning row.
- Use that rule in `load_foods` in `apps/api/src/vetdietderm_api/assessments/repository.py` for `basis == "per_100g_as_fed"` before building `FoodValue`.
- Leave extra source rows stored. Do not drop `uq_food_nutrient_values_identity` and do not rewrite saved diet-plan snapshots.
- `apps/clinic-web/src/features/nutrition/components/ration-add-dialog.tsx` reads ME with `code === "ME"` and `basis === "per_100g_as_fed"`. After detail serialization returns one row for that pair, that existing lookup must show the canonical ME. Change the dialog only if a detail response can still contain a second row for the same pair.
- The same ordering must be deterministic on the SQLite test database and on PostgreSQL. Extend the existing `DISTINCT` / `ORDER BY updated_at DESC` matrix query with `uuid DESC` rather than replacing it with an unordered scan.

## Acceptance Criteria
- Given two `per_100g_as_fed` rows for the same food and nutrient, value 12 with the newer `updated_at` and value 3 with the older `updated_at`, matrix, food detail, and `load_foods` all expose 12 even when the older row is inserted last.
- When both rows share `updated_at`, all three readers expose the row with the greater `uuid`.
- The non-winning row remains in `food_nutrient_values`.
- An assessment that uses `load_foods` sends the canonical value into the ration. Opening an already saved plan still returns its stored snapshot without recomputing nutrients.
- A food with one row per nutrient and basis keeps that row in the matrix, detail, and assessment.

## Dependencies
None. This cycle is the clinical-state slice of `docs/audit/2026-11-01-audit.md` (AUD-006). No other issue under `docs/issues/clinical-state/` blocks it. Assumption: newest `updated_at`, then greatest `uuid`, is the source-selection policy. This issue does not choose among source types beyond that order, and it does not repair historical plan snapshots.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/catalog/repository.py`
- `apps/api/src/vetdietderm_api/assessments/repository.py`
- `apps/api/src/vetdietderm_api/catalog/models.py`
- `apps/clinic-web/src/features/nutrition/components/ration-add-dialog.tsx`
- `apps/api/tests/catalog/test_nutrient_source_selection.py`

## Implementation Steps
- [x] Step 1: Add one shared selector used by the matrix sort subquery, the matrix value query, and `serialize_nutrient_values`: order by `updated_at DESC`, `uuid DESC`, and keep a single row per food, nutrient, and basis.
- [x] Step 2: Apply the same order in `load_foods` and ignore a later row for a code that already has a winner.
- [x] Step 3: Check `ration-add-dialog.tsx`. Leave the ME `find` in place when detail returns one `ME` / `per_100g_as_fed` row. If it can return more than one, select the row the API marks as the only serialized value for that pair.
- [x] Step 4: Add `apps/api/tests/catalog/test_nutrient_source_selection.py` on a `sqlite://` engine. Insert the newer CP 12 row before the older CP 3 row, then assert matrix, `serialize_nutrient_values`, and `load_foods` return 12. Add the equal-`updated_at` uuid tie case. Assert the older row is still stored.
- [x] Step 5: Run the verification command below.

## Verification
- `uv run --directory apps/api pytest tests/catalog/test_nutrient_source_selection.py tests/catalog/test_food_energy.py -q` passes.
- The new test fails if the selector result changes when the two source rows are inserted in the opposite order.
- `uv run --directory apps/api pytest tests/assessments/test_plan_provider_snapshot.py tests/assessments/test_plan_legacy_snapshot.py -q` passes, showing stored plan reads are not recomputed by this selector.

## Verification Results
- TDD: observed 8 regression failures before implementation, including stale matrix values, duplicate detail values, and assessment timestamp ties.
- Required targeted checks: 61 passed. Catalog and assessment suites: 63 passed.
- Used an explicit workspace uv cache because the default C:/uv/cache is not writable.
- SQLite emits the existing SQLAlchemy DISTINCT ON deprecation warning; the ordered first-winner fallback is covered. Live PostgreSQL verification was not run; the PostgreSQL DISTINCT / ORDER BY query is preserved and extended with uuid DESC.
- Cycle remains open: booked-visit-type-sync is Not Started. No matching clinical-state roadmap row exists in docs/PROJECT.md.
