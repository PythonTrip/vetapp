---
source_prd: docs/prd/2026-08-27_fediaf-stronger_prd.md
prd_id: 2026-08-27-fediaf-stronger
cycle_id: 2026-08-27-fediaf-stronger
cycle_slug: fediaf-stronger
project_doc: docs/PROJECT.md
status: Done
---

# JSON Source of Truth

## Implementation Status
Status: Done

Allowed values: Not Started, In Progress, Blocked, Done.

## Description
Replace the CSV-generated FEDIAF slice with a build-time codegen pipeline that reads the FEDIAF 2025 RU JSON database and emits a typed runtime module. The Nutrition clinical engine must consume only that module, and the UI must surface edition/version, source title/URL, and clinical disclaimer from `database_meta`.

## Requirements
- Treat `docs/fediaf_2025_veterinary_nutrition_database_ru.json` (validated against `docs/fediaf_2025_veterinary_nutrition_schema.json`) as the sole guidelines source of truth for codegen input.
- Replace `scripts/generate-fediaf-data.mjs` so it reads the JSON database instead of `docs/fediaf_2025_nutrients_1000kcal.csv` and `docs/fediaf_2025_energy_formulas.csv`.
- Emit a typed module at `src/lib/fediaf-data.ts` (same operational role as today) containing nutrient stages/norms, energy formulas, size classes, catalogs needed at runtime, and `database_meta` fields: `version`, `source.title`, `source.url`, `source.publication_date`, `clinical_warning_ru`, and scope flags (`healthy_animals_only`, `disease_specific_diets_included`).
- Preserve Russian labels (`name_ru` / `*_ru`) from the database for stage, formula, and nutrient display strings used by the Nutrition UI.
- Keep formula expressions mathjs-compatible per `database_meta.formula_expression_language`.
- Update `src/lib/fediaf.ts` (and any direct importers of `fediaf-data.ts`) so stage lists, norm lookup, and MER estimation read the new generated shapes and codes from the JSON database.
- Expose meta helpers (or exported constants) so analysis UI and Diet Plan save can cite edition/version, source title/URL, and clinical disclaimer without re-parsing the JSON at runtime.
- Do not load or parse the full JSON database on each API request or page render; runtime must use only the generated module.
- Do not introduce Postgres tables for FEDIAF norms in this cycle.

## Acceptance Criteria
- Running the generator successfully regenerates `src/lib/fediaf-data.ts` from the JSON database with no CSV inputs required.
- `src/lib/fediaf.ts` resolves nutrient minimums and energy formulas using database stage/formula codes and Russian labels.
- Callers can read FEDIAF `version` (e.g. `2025.09`), source title, source URL, and `clinical_warning_ru` from the generated module.
- Null nutrient values in generated data remain distinguishable from zero (null means “not established”).
- App build/typecheck succeeds against the new module shapes.
- CSV files are no longer referenced by the generator script (archival file presence on disk is out of scope for this issue; removal is handled by Legacy Removal).

## Dependencies
- Source files present: `docs/fediaf_2025_veterinary_nutrition_database_ru.json`, `docs/fediaf_2025_veterinary_nutrition_schema.json`.
- Assumption: keep output path `src/lib/fediaf-data.ts` and evolve its exported types in place so downstream Nutrition code can migrate incrementally.

## Files Likely Touched
- `scripts/generate-fediaf-data.mjs`
- `src/lib/fediaf-data.ts` (generated)
- `src/lib/fediaf.ts`
- `src/lib/nutrition-analysis.ts` (norm resolution imports)
- `package.json` (optional script alias for codegen if one is added)
- `docs/fediaf_2025_veterinary_nutrition_database_ru.json` (read-only input)
- `docs/fediaf_2025_veterinary_nutrition_schema.json` (read-only validation reference)

## Implementation Steps
- [x] Step 1: Inventory current exports in `src/lib/fediaf-data.ts` and call sites in `src/lib/fediaf.ts` / `src/lib/nutrition-analysis.ts` to define the minimal generated surface (stages, norms, energy formulas, meta, size classes).
- [x] Step 2: Rewrite `scripts/generate-fediaf-data.mjs` to load the RU JSON, optionally validate required top-level keys against the schema contract, and map catalogs/stages/formulas/size classes into TypeScript exports.
- [x] Step 3: Include `database_meta` (version, source title/URL/publication_date, clinical_warning_ru, scope flags) as named exports or a `FEDIAF_DATABASE_META` object in the generated module.
- [x] Step 4: Map nutrient minimums so null values stay `null` (not `0`) and preserve per-nutrient `note_ru` / footnote / source table-page fields when present in JSON.
- [x] Step 5: Update `src/lib/fediaf.ts` types and helpers (`FediafStage`, energy estimate, stage options) to consume the new codes and Russian labels from the generated module.
- [x] Step 6: Adjust `src/lib/nutrition-analysis.ts` `resolveNorms` FEDIAF branch to use the new stage-code lookup without requiring CSV-era stage name assumptions.
- [x] Step 7: Run the generator and fix TypeScript errors until `fediaf.ts` and analysis imports compile.
- [x] Step 8: Smoke-check that imported meta version/disclaimer match JSON `database_meta` and that at least one dog and one cat stage resolve non-empty norms.

## Verification
- Run `node scripts/generate-fediaf-data.mjs` and confirm `src/lib/fediaf-data.ts` is rewritten from JSON (no CSV path reads in the script).
- Confirm generated meta exports match JSON: version `2025.09`, source URL from `database_meta.source.url`, and `clinical_warning_ru` text.
- Typecheck the app (project’s usual `tsc` / `next build` or `npx tsc --noEmit`) and confirm no errors from FEDIAF module shape changes.
- In a Node one-liner or temporary console check, resolve norms for one dog adult stage and one cat growth/reproduction stage and verify null mins are not coerced to `0`.
