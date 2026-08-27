---
source_prd: docs/prd/2026-08-27_fediaf-stronger_prd.md
prd_id: 2026-08-27-fediaf-stronger
cycle_id: 2026-08-27-fediaf-stronger
cycle_slug: fediaf-stronger
project_doc: docs/PROJECT.md
status: Done
---

# Clinical Happy Path

## Implementation Status
Status: Done

Allowed values: Not Started, In Progress, Blocked, Done.

## Description
Enable a veterinary nutritionist to run the full energy-and-stage workflow with or without a selected Pet: enter or prefill animal profile parameters, receive a suggested life stage / energy formula / size class, confirm before applying, then compute FEDIAF MER (primary) with RER × factor as a secondary cross-check—including pregnancy, lactation with litter parameters, and dog size-class mapping.

## Requirements
- Support the workflow without a patient: manual entry of species (dog/cat), weight, and other profile fields required by the selected formula from JSON `data_model.animal_profile_fields` (subset per formula).
- Support the workflow with a patient: prefill from Pet (`species`, `currentWeight`, `targetWeight`, `neutered`, `lifeStage`, `activityLevel`, `birthDate` for age derivation, breed when useful for size-class hints).
- System may suggest life stage code, energy formula / phase code, and dog size class; it must never silently apply suggestions—clinician must confirm before norms and FEDIAF MER are used.
- Manual override of stage and energy formula remains available after suggestion.
- Support pregnancy and lactation paths, including lactation week and litter size when required by database formulas.
- Map dog size class using database size-class catalogs and expected adult weight / current weight rules present in the JSON; show an explicit unresolved-size-class state when mapping cannot be completed.
- Show FEDIAF MER as the primary guideline-backed energy estimate when required parameters are present, including ranges when the database provides them.
- Keep RER × factor (`src/lib/nutrition.ts` `calculateRERMER` / factor path) visible as a secondary cross-check beside FEDIAF MER.
- Surface explicit incomplete-parameter states when weight is missing or a selected MER formula lacks required inputs (do not imply a successful MER).
- Restrict FEDIAF clinical path to dog and cat; non-dog/cat Pet species must show that FEDIAF guidelines do not apply.

## Acceptance Criteria
- Without a selected Pet, a clinician can enter species + weight (+ formula-required fields) → confirm stage/formula → see FEDIAF MER and RER × factor.
- With a selected dog or cat Pet, profile fields prefill; suggested stage/formula/size class appear as suggestions requiring confirm.
- Confirming applies the stage to downstream norm selection / MER; dismissing or changing override does not leave a silently applied suggestion.
- Pregnancy and lactation flows accept litter-related inputs when the selected formula requires them and block MER with a visible missing-input message when they are absent.
- Unresolved dog size class shows a visible blocking or warning state rather than a fabricated class.
- Missing weight prevents presenting a successful FEDIAF MER result.
- RER × factor remains visible alongside FEDIAF MER when both can be computed.

## Dependencies
- `docs/issues/fediaf-stronger/json-source-of-truth.md` — generated stages, energy formulas, size classes, and animal-profile field codes must exist.
- Assumption for Pet → FEDIAF mapping when confidence is low: suggest the closest catalog stage from Pet `lifeStage` / `activityLevel` / age, mark suggestion confidence as low in UI copy, and require explicit clinician confirm (never auto-apply a low-confidence mapping).

## Files Likely Touched
- `src/components/modules/nutrition.tsx` (`PatientContextBar`, `RERMERCalculator`, related stage/formula UI)
- `src/lib/nutrition-workspace.ts`
- `src/lib/fediaf.ts`
- `src/lib/fediaf-data.ts` (consumed)
- `src/lib/nutrition.ts` (RER × factor cross-check)
- `src/lib/types.ts` (Pet fields / workspace types if extended)
- `src/app/nutrition/page.tsx` (only if page wiring changes)

## Implementation Steps
- [x] Step 1: Extend `nutrition-workspace.ts` state with manual animal profile fields, suggested vs confirmed stage/formula/size-class codes, and confirmation flag (`stageConfirmed` or equivalent).
- [x] Step 2: Implement prefills from selected Pet into workspace profile fields, deriving age weeks/months from `birthDate` when present.
- [x] Step 3: Implement suggestion helpers in `fediaf.ts` (or a dedicated helper module) that map profile → candidate life stage, energy formula/phase, and dog size class using generated catalogs; return suggestion + confidence, never mutating confirmed codes automatically.
- [x] Step 4: Update `PatientContextBar` / RER-MER UI to show suggestions with Confirm / Override controls; apply confirmed codes only after clinician action.
- [x] Step 5: Add pregnancy and lactation inputs (`pregnant`, `lactating`, `lactation_week`, `litter_size`) to the RER/MER panel when species and formula require them.
- [x] Step 6: Wire FEDIAF MER estimation to confirmed formula + profile parameters; show range when generated formula data includes min/max or equivalent.
- [x] Step 7: Keep RER × factor calculation visible as secondary output using existing `calculateRERMER` path.
- [x] Step 8: Add visible incomplete states for missing weight, unresolved size class, and missing lactation/pregnancy parameters required by the selected formula.
- [x] Step 9: Gate non-dog/cat species with a clear “FEDIAF applies to dogs and cats only” message and disable FEDIAF MER/norms application for those species.
- [ ] Step 10: Manually walk with-patient and without-patient paths for adult dog, growing puppy with size class, and lactating cat to confirm suggestion → confirm → MER behavior. Without-patient dog/cat paths were verified in the browser and all helper scenarios passed; live with-patient verification was unavailable because the local Pet API could not open its Prisma TLS connection.

## Verification
- Manual: open Nutrition without a Pet, enter dog weight and adult parameters, confirm suggested stage/formula, verify FEDIAF MER appears and RER × factor still shows.
- Manual: select a dog Pet, verify prefills, change suggestion via override, confirm that norms/MER follow the confirmed codes only after confirm.
- Manual: select lactation formula without litter size → visible incomplete state and no successful FEDIAF MER.
- Manual: dog path with insufficient adult-weight/size inputs → unresolved size-class state.
- Manual: non-dog/cat Pet → FEDIAF path blocked with clear message.
- Typecheck / lint the touched Nutrition modules after UI state changes.
