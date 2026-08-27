---
source_prd: docs/prd/2026-08-27_fediaf-stronger_prd.md
prd_id: 2026-08-27-fediaf-stronger
cycle_id: 2026-08-27-fediaf-stronger
cycle_slug: fediaf-stronger
project_doc: docs/PROJECT.md
status: Done
---

# Out-of-Scope Gate

## Implementation Status
Status: Done

Allowed values: Not Started, In Progress, Blocked, Done.

## Description
When the Nutrition workflow indicates disease-specific or therapeutic diet goals, block presenting FEDIAF 2025 values as applicable nutrient targets and show a clear “outside FEDIAF 2025 scope” state, because the guidelines cover healthy animals only.

## Requirements
- Add an explicit clinician-controlled flag in the Nutrition workspace for therapeutic / disease-specific diet goals (e.g. `therapeuticGoal: boolean` or equivalent).
- When the flag is set, do not present FEDIAF nutrient minimums as applicable targets in analysis charts/tiles.
- When the flag is set, show a dedicated out-of-scope state that explains FEDIAF 2025 covers healthy dogs/cats only, using scope wording aligned with `database_meta.scope` / `reason_ru` and `diseases_and_conditions` guidance from the JSON database.
- Do not fabricate disease-specific nutrient profiles or substitute therapeutic targets.
- Energy tools (RER × factor and informational FEDIAF MER for healthy-animal formulas) may remain visible as calculators, but must not be labeled as disease-diet targets while the gate is active; copy must state they are not therapeutic prescriptions.
- Persist the therapeutic-goal flag in workspace session state for the current Nutrition working session; Diet Plan persistence of this flag is optional and only required if save path already stores FEDIAF assessment metadata in the same cycle.
- Do not implement heuristic auto-detection from consultation specialty/diagnoses in this cycle (PRD open question deferred); detection is the explicit clinician flag only.

## Acceptance Criteria
- Clinician can toggle a clear “therapeutic / disease-specific goal” control in Nutrition.
- With the flag on, FEDIAF norm comparison tiles/charts are replaced or blocked by an “outside FEDIAF 2025 scope” state.
- With the flag on, no UI copy claims FEDIAF mins are appropriate therapeutic targets.
- With the flag off, normal FEDIAF analysis path works as in Ration Analysis Quality Bar / Clinical Happy Path.
- Scope explanation references healthy-animals-only limitation (RU database reason text or equivalent localized UI string driven from generated meta).

## Dependencies
- `docs/issues/fediaf-stronger/json-source-of-truth.md` — scope meta and reason text available from generated module.
- `docs/issues/fediaf-stronger/ration-analysis-quality-bar.md` — analysis UI is the primary surface gated; gate can land against current analysis if quality-bar work is parallel, but must wrap the definitive norm comparison presentation.
- Assumption: explicit clinician flag only (no diagnosis/specialty heuristics) for this cycle.

## Files Likely Touched
- `src/lib/nutrition-workspace.ts`
- `src/components/modules/nutrition.tsx` (`DietNutrientAnalysis`, patient/context bar or analysis header control)
- `src/lib/fediaf-data.ts` / `src/lib/fediaf.ts` (scope meta helpers)
- `src/lib/nutrition-analysis.ts` (optional early return when gated)

## Implementation Steps
- [x] Step 1: Add `therapeuticGoal` (boolean, default `false`) to `nutrition-workspace.ts` with a setter.
- [x] Step 2: Add a visible toggle/checkbox in Nutrition UI (analysis header or patient context bar) labeled for therapeutic/disease-specific diet goals.
- [x] Step 3: When `therapeuticGoal` is true, short-circuit definitive FEDIAF norm comparison rendering in `DietNutrientAnalysis` (and any shared helper) with an out-of-scope panel.
- [x] Step 4: Populate out-of-scope copy from generated `database_meta.scope` / `reason_ru` (and clinical warning), stating healthy-animals-only and that disease-specific diets are excluded.
- [x] Step 5: Ensure energy panels do not claim therapeutic targeting while the gate is active (disclaimer line on RER/MER panel).
- [x] Step 6: Verify toggling off restores the normal FEDIAF analysis path for the confirmed stage.
- [ ] Step 7: Walk through dog adult ration with gate on/off to confirm no FEDIAF target tiles appear while gated. (Blocked in this environment by Prisma TLS credentials; the empty-ration analysis surface and confirmed adult-dog energy flow were verified on/off.)

## Verification
- Manual: with a confirmed stage and ration, enable therapeutic goal → analysis shows outside-scope state and hides FEDIAF target comparison.
- Manual: disable therapeutic goal → FEDIAF comparison returns.
- Manual: confirm no disease nutrient profile numbers are invented or shown.
- Confirm scope reason text is visible and consistent with JSON `database_meta.scope.reason_ru`.
- Typecheck touched workspace/UI files.
