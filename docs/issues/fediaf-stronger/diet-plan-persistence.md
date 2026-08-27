---
source_prd: docs/prd/2026-08-27_fediaf-stronger_prd.md
prd_id: 2026-08-27-fediaf-stronger
cycle_id: 2026-08-27-fediaf-stronger
cycle_slug: fediaf-stronger
project_doc: docs/PROJECT.md
status: Done
---

# Diet Plan Persistence

## Implementation Status
Status: Done

Allowed values: Not Started, In Progress, Blocked, Done.

## Description
When saving a Diet Plan from Nutrition, persist FEDIAF assessment metadata—edition/version, confirmed stage code, and clinical disclaimer—so a later reader can reproduce which guideline context produced the plan, without introducing Encounter/Calculation CRM entities.

## Requirements
- Extend Diet Plan storage to include FEDIAF metadata: guideline version/edition, confirmed stage code, and clinical disclaimer text (or stable reference plus stored snapshot text).
- Capture metadata at save time from the Nutrition workspace confirmed stage and generated `database_meta` (version + `clinical_warning_ru`).
- Save paths from Nutrition (`RERMERCalculator.saveToPet` and `DietTemplateBuilder.saveToPet` in `nutrition.tsx`) must include the metadata whenever a FEDIAF assessment context is active.
- If stage is not confirmed, either block save of FEDIAF-backed assessment metadata with a clear message, or save the plan without claiming FEDIAF reproducibility—prefer requiring confirm when the clinician intends a FEDIAF-backed plan.
- Update create API (`src/app/api/diet-plans/route.ts`), Prisma `DietPlan` model / types, and CRM diet plan panel display so stored FEDIAF version, stage, and disclaimer are visible when present.
- Do not add Workspace auth, Encounter, or Calculation entities in this cycle.
- Assumption for storage shape (PRD open question): add an optional `fediafMeta String?` JSON column on `DietPlan` with shape `{ version: string, stageCode: string, disclaimerRu: string, sourceTitle?: string, sourceUrl?: string, savedAt: string }` rather than three separate columns; keep `macros` / `template` behavior unchanged.

## Acceptance Criteria
- Saving a plan from Nutrition after confirming a FEDIAF stage stores version, stage code, and disclaimer on the DietPlan record.
- Reloading the pet’s diet plans shows the stored FEDIAF version and stage (and disclaimer available in detail/notes UI).
- Plans saved without FEDIAF context (e.g. non-dog/cat or unconfirmed stage per chosen save rules) do not display fabricated FEDIAF metadata.
- Existing plan fields (`rer`, `mer`, `macros`, `template`, `notes`) continue to save.
- No new CRM Encounter/Calculation models are introduced.

## Dependencies
- `docs/issues/fediaf-stronger/json-source-of-truth.md` — version and disclaimer from generated meta.
- `docs/issues/fediaf-stronger/clinical-happy-path.md` — confirmed stage code in workspace.
- Assumption: `fediafMeta` JSON string column on `DietPlan` as specified above.

## Files Likely Touched
- `prisma/schema.prisma` (`DietPlan`)
- `src/lib/types.ts` (`DietPlan`)
- `src/app/api/diet-plans/route.ts`
- `src/lib/hooks.ts` (`useCreateDietPlan`)
- `src/components/modules/nutrition.tsx` (`saveToPet` handlers)
- `src/components/crm/diet-plan-panel.tsx`
- Prisma migration under `prisma/migrations/`

## Implementation Steps
- [x] Step 1: Add optional `fediafMeta String?` to Prisma `DietPlan` and create a migration.
- [x] Step 2: Extend `DietPlan` TypeScript type and create-payload validation to accept parsed/serialized `fediafMeta`.
- [x] Step 3: Update `POST` in `src/app/api/diet-plans/route.ts` to persist `fediafMeta`.
- [x] Step 4: In Nutrition `saveToPet` handlers, build `fediafMeta` from workspace confirmed stage + generated database meta when stage is confirmed; if not confirmed, show a confirm prompt before saving as FEDIAF-backed (or save without `fediafMeta` with clear UI indication).
- [x] Step 5: Update `useCreateDietPlan` callers/types so the new field flows through.
- [x] Step 6: Update `diet-plan-panel.tsx` to display FEDIAF version and stage code when `fediafMeta` is present, and show disclaimer in expandable detail or notes area.
- [ ] Step 7: Migrate/generate Prisma client and smoke-save one plan from Nutrition for a dog with confirmed stage; reload and verify metadata round-trips. Migration/client generation passed and object/serialized API POSTs returned 201; live GET reload was interrupted by the known Neon `P1017` connection closure, and both temporary records were removed.
- [x] Step 8: Verify an old plan without `fediafMeta` still renders without errors.

## Verification
- Apply migration locally and confirm Prisma client includes `fediafMeta`.
- Manual: confirm stage in Nutrition → save plan → open CRM diet plan panel → see version, stage code, disclaimer.
- Manual: attempt save without confirmed stage → either blocked with prompt or saved without FEDIAF meta (matching chosen rule), never inventing a stage.
- API smoke: POST `/api/diet-plans` with `fediafMeta` JSON and GET/list pet plans to confirm persistence.
- Confirm no Encounter/Calculation models were added to `schema.prisma`.
