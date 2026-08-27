---
source_prd: docs/prd/2026-08-27_fediaf-stronger_prd.md
prd_id: 2026-08-27-fediaf-stronger
cycle_id: 2026-08-27-fediaf-stronger
cycle_slug: fediaf-stronger
project_doc: docs/PROJECT.md
status: Not Started
---

# Ration Analysis Quality Bar

## Implementation Status
Status: Not Started

Allowed values: Not Started, In Progress, Blocked, Done.

## Description
Raise Nutrition diet-builder analysis to a clinician-trustworthy FEDIAF quality bar: compare ration nutrient totals to confirmed-stage FEDIAF minimums, show per-nutrient notes, cite source table/page when available, and make incomplete-data states explicit instead of implying success.

## Requirements
- Compare diet builder aggregated nutrients (`aggregateDietNutrients` / `buildNormComparison` path) against FEDIAF norms for the clinician-confirmed stage only.
- Render per-nutrient `note_ru` / footnote text from generated FEDIAF data when present for a nutrient-stage cell.
- Treat null / NE (“not established”) FEDIAF values as incomplete reference data: show an explicit “not established” state, never display them as zero or as a met target.
- Show an explicit incomplete state when ration catalog nutrient coverage is insufficient for a meaningful comparison (low coverage %), and do not present that comparison as a successful complete assessment.
- Show an explicit incomplete state when required animal/MER parameters for the active energy context are missing (aligned with Clinical Happy Path messaging where shared).
- Cite source table and/or page for norms when those fields exist on generated nutrient/stage records; fall back to edition-level source title/URL from `database_meta` when row-level cite is absent.
- Display `database_meta.clinical_warning_ru` (or generated equivalent) on the analysis view as an informational clinical disclaimer.
- Orient analysis to complete-feed FEDIAF norms; do not add a separate complementary-feed analysis branch in this cycle, but keep the disclaimer that values are recommendations for complete/complementary commercial pet food for healthy animals.
- After NRC removal lands, analysis must not offer an alternate norm standard; until then, this issue’s FEDIAF quality behaviors must work for the FEDIAF path without depending on NRC.

## Acceptance Criteria
- With a confirmed stage and adequate ration coverage, analysis charts/tiles compare ration nutrients to FEDIAF minimums for that stage.
- Nutrients with null FEDIAF mins show “not established” (or equivalent) and are excluded from “met minimum” success counting.
- Nutrients with `note_ru`/footnote show that text in the analysis UI (not only in generated data).
- Low catalog nutrient coverage shows a visible incomplete-data banner/state rather than a clean pass.
- Source citation is visible: row-level table/page when available, otherwise edition source title/URL.
- Clinical warning from database meta is visible on the analysis surface.
- Missing confirmed stage prevents presenting a definitive FEDIAF norm comparison (prompt to confirm stage instead).

## Dependencies
- `docs/issues/fediaf-stronger/json-source-of-truth.md` — norms, notes, nulls, and meta citations in the generated module.
- `docs/issues/fediaf-stronger/clinical-happy-path.md` — confirmed stage code must be available to analysis; if Clinical Happy Path is not yet complete, temporarily require explicit stage selection but do not invent silent defaults.
- Assumption: complementary vs complete stays disclaimer-only; no separate complementary scoring branch.

## Files Likely Touched
- `src/components/modules/nutrition.tsx` (`DietNutrientAnalysis`)
- `src/lib/nutrition-analysis.ts`
- `src/lib/fediaf.ts`
- `src/lib/fediaf-data.ts` (consumed)
- `src/lib/nutrition-workspace.ts` (confirmed stage / coverage flags if needed)

## Implementation Steps
- [ ] Step 1: Extend norm resolution / comparison types in `nutrition-analysis.ts` to carry null-vs-number mins, optional `note_ru`, and optional source table/page fields from generated FEDIAF data.
- [ ] Step 2: Update `buildNormComparison` (or successor) so null mins produce an explicit `not_established` status instead of `% of 0` or false “met”.
- [ ] Step 3: Wire `DietNutrientAnalysis` to the clinician-confirmed FEDIAF stage from workspace state; if stage is unconfirmed, show a confirm-stage prompt and skip definitive comparison.
- [ ] Step 4: Render per-nutrient footnotes/`note_ru` beside deficit/comparison tiles where present.
- [ ] Step 5: Add incomplete-data UI for insufficient ration nutrient coverage using the existing coverage % from aggregation; define a clear threshold based on current coverage metric (document the threshold in code comments near the check).
- [ ] Step 6: Add source citation UI: prefer nutrient-stage table/page; else show `database_meta` source title + URL + version.
- [ ] Step 7: Surface `clinical_warning_ru` on the analysis panel.
- [ ] Step 8: Align empty/error copy for missing weight / missing MER parameters with the RER-MER panel messaging so incomplete energy context is visible from analysis when relevant.
- [ ] Step 9: Smoke-check adult dog and growth stages with a mixed catalog ration including at least one nutrient that has `note_ru` and one with null min in the database.

## Verification
- Manual: build a ration in Diet Template, confirm a FEDIAF stage, verify comparison uses that stage’s mins.
- Manual: locate a nutrient with null min in generated data and confirm UI shows “not established”, not 0% or “met”.
- Manual: confirm a nutrient with `note_ru` displays the note in analysis.
- Manual: reduce catalog coverage (products missing many nutrients) and confirm incomplete-coverage state appears.
- Manual: clear/unconfirm stage and confirm analysis refuses a definitive FEDIAF pass.
- Confirm clinical warning and source URL/version are visible on the analysis panel.
- Typecheck touched analysis/UI files.
