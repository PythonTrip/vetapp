---
source_prd: docs/prd/2026-08-27_fediaf-stronger_prd.md
prd_id: 2026-08-27-fediaf-stronger
cycle_id: 2026-08-27-fediaf-stronger
cycle_slug: fediaf-stronger
project_doc: docs/PROJECT.md
status: Done
---

# Legacy Removal

## Implementation Status
Status: Done

Allowed values: Not Started, In Progress, Blocked, Done.

## Description
Carefully remove the CSV FEDIAF generation path and NRC 2006 as a selectable norm standard so the JSON-derived FEDIAF 2025 module is the only guidelines source of truth, while keeping RER × factor as a secondary energy cross-check and leaving unrelated legacy UI and archival xlsx alone unless separately decided.

## Requirements
- Stop treating `docs/fediaf_2025_nutrients_1000kcal.csv` and `docs/fediaf_2025_energy_formulas.csv` as runtime or generator SoT; generator must already read JSON (from JSON Source of Truth).
- Remove CSV input handling from `scripts/generate-fediaf-data.mjs` if any remains; do not leave dual CSV+JSON generation paths.
- Remove `nrc2006` from `NormStandard` types, `nutrition-workspace` state, Nutrition UI norm selector, and `resolveNorms` / analysis branches.
- Delete or stop shipping `NRC_ADULT_NORMS_PER_1000KCAL` and NRC-specific footnote/copy branches in analysis UI.
- Nutrition norm selector becomes FEDIAF-only (no NRC toggle); default and only standard is FEDIAF 2025.
- Keep RER × factor energy calculation path in `src/lib/nutrition.ts` and its display beside FEDIAF MER.
- Do not delete translation/i18n boundary UI, dermatology/knowledge/scheduling modules, or `docs/fediaf_2025_veterinary_nutrition_ru.xlsx` in this issue.
- Assumption for CSV/xlsx files on disk (PRD open question): leave CSV and xlsx files in `docs/` as archives for now; do not delete them in this issue. Optionally add a one-line comment in the generator or docs note that they are archival only—not runtime SoT.

## Acceptance Criteria
- Generator has zero CSV read paths; regenerating data uses only the JSON database.
- UI has no control to select NRC 2006.
- TypeScript `NormStandard` (or equivalent) no longer includes `nrc2006`.
- Analysis always resolves FEDIAF norms for the confirmed stage; NRC adult table is gone from runtime.
- RER × factor still computes and displays in the RER/MER panel.
- Archival xlsx remains on disk; unrelated modules untouched.
- App typecheck/build succeeds after removals.

## Dependencies
- `docs/issues/fediaf-stronger/json-source-of-truth.md` must be Done so Nutrition is not left without a FEDIAF data path.
- Prefer completing `docs/issues/fediaf-stronger/ration-analysis-quality-bar.md` FEDIAF analysis path before deleting NRC, so clinicians are not left without a working norm comparison during cutover.
- Assumption: keep CSV/xlsx files as archives; deletion deferred to a later cleanup decision.

## Files Likely Touched
- `scripts/generate-fediaf-data.mjs`
- `src/lib/nutrition-analysis.ts` (`NRC_ADULT_NORMS_PER_1000KCAL`, `resolveNorms`)
- `src/lib/nutrition-workspace.ts` (`normStandard` / `setNormStandard`)
- `src/components/modules/nutrition.tsx` (norm `<SelectItem value="nrc2006">`, NRC footnotes)
- `src/lib/types.ts` or local norm-standard union types
- `src/lib/nutrition.ts` (keep RER × factor; remove only NRC-as-norm-standard coupling if any)
- Do not touch: i18n locale switching, archival `docs/fediaf_2025_veterinary_nutrition_ru.xlsx`, non-Nutrition modules

## Implementation Steps
- [x] Step 1: Confirm JSON generator path works end-to-end and Nutrition analysis runs on FEDIAF-only data.
- [x] Step 2: Remove any remaining CSV file reads/references from `scripts/generate-fediaf-data.mjs` and related comments/docs that describe CSV as SoT.
- [x] Step 3: Remove `nrc2006` from workspace state and simplify `normStandard` to FEDIAF-only (or remove the selector state entirely if redundant).
- [x] Step 4: Remove NRC option and NRC footnote branch from `DietNutrientAnalysis` / norm selector UI in `nutrition.tsx`.
- [x] Step 5: Delete `NRC_ADULT_NORMS_PER_1000KCAL` and the NRC branch of `resolveNorms` in `nutrition-analysis.ts`; make FEDIAF the only resolution path.
- [x] Step 6: Grep the repo for `nrc2006`, `NRC_ADULT`, and CSV FEDIAF generator references; remove leftover runtime uses (ignore archival filenames left on disk).
- [x] Step 7: Verify RER × factor UI/calc still works beside FEDIAF MER.
- [x] Step 8: Typecheck/build and smoke Nutrition analysis on dog and cat stages without a norm-standard toggle.

## Verification
- Grep: no runtime `nrc2006` selector values or `NRC_ADULT_NORMS` symbols remain under `src/`.
- Grep: `scripts/generate-fediaf-data.mjs` does not reference `fediaf_2025_nutrients_1000kcal.csv` or `fediaf_2025_energy_formulas.csv`.
- Manual: Nutrition UI shows no NRC toggle; analysis still compares against FEDIAF confirmed stage.
- Manual: RER × factor still appears in RER/MER panel.
- Confirm `docs/fediaf_2025_veterinary_nutrition_ru.xlsx` still exists and non-Nutrition routes still load.
- Run project typecheck/build after the removals.
