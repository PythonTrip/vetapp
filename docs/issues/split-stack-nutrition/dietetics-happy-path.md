---
source_prd: docs/prd/2026-08-28_split-stack-nutrition_prd.md
prd_id: 2026-08-28-split-stack-nutrition
cycle_id: 2026-08-28-split-stack-nutrition
cycle_slug: split-stack-nutrition
project_doc: docs/PROJECT.md
status: In Progress
---

# Dietetics Happy Path

## Implementation Status
Status: In Progress

Allowed values: Not Started, In Progress, Blocked, Done.

## Description
Let a veterinary nutritionist, with a selected Patient or a manual profile, confirm animal and guideline context, build one ration from the Food catalog in grams, and receive an honest FEDIAF 2025 nutrient and energy assessment from FastAPI — including therapeutic-goal gating, feed-form honesty, and statuses that never treat null as a passed minimum.

## Requirements
- FastAPI `assessments` module: pure assessment pipeline that loads only the `published` guideline edition from PostgreSQL (never JSON, never `fediaf-data.ts`). Engine input: animal profile, confirmed `profile_code`, confirmed `energy_formula_code`, optional confirmed `size_class_code`, `feed_form` (`dry | wet | unknown`), `therapeutic_goal` boolean, ration components (`food_uuid`, `grams` > 0). Suggestions are never applied inside the engine.
- `POST /assessments` (Bearer, Pydantic body) always recomputes on the server. Response DTO includes: engine identity string (constant, e.g. `nutrition-engine/1.0.0`), edition code/checksum, confirmed context echo, energy block (FEDIAF MER kcal and optional range, plus RER × factor secondary kcal), coverage counts, and rows: name, derived flag, ration per 1000 kcal ME, target, status, completeness, source (edition title/URL at minimum; table/page/row when `source_references` exist).
- Status enum (`enum.StrEnum`) exactly: `met`, `below_minimum`, `above_maximum`, `not_established`, `not_applicable`, `insufficient_context`, `missing_product_data`. Null / not-established is never coerced to 0 and never counted as `met`. `missing_product_data`: catalog lacks that atomic value for a component contributing mass. `insufficient_context`: unconfirmed profile (reject or return gated DTO with no normative comparison), missing MER parameters, or unknown feed form on a form-dependent target. `not_applicable`: rule does not apply (e.g. dry selenium when `feed_form` is `wet`).
- Suggestion-only inference (separate `POST /assessments/suggestions` or fields on a GET): life stage profile, energy formula, dog size class from species, weight, age, activity, neuter, pregnancy/lactation/litter, expected adult weight. The UI must require clinician Confirm before `POST /assessments` sends confirmed codes. Low-confidence mappings still require Confirm; never auto-apply.
- Therapeutic-goal flag: when true, do not run FEDIAF normative comparison (no `met` / min-max table presented as a healthy-animal pass). Return energy if parameters allow, plus an out-of-scope explanation. Healthy-animal guideline only.
- Ration builder: one list of Foods (commercial, ingredient, supplement together), grams per line. Infer `feed_form` when every positive-gram food has the same `dry` or `wet`; mixed or any `unknown` food → `unknown`. Clinician override `dry | wet | clear` is sent as confirmed feed form. Mixed wet/dry rations remain valid; form-dependent selenium and taurine rows are `insufficient_context` until override.
- Energy: FEDIAF MER from published formula AST is primary; RER × factor (`70 * weight_kg^0.75` × clinician factor, default factors visible in UI) is secondary beside it. Missing weight or formula-required fields (lactation week, litter size, unresolved dog size class when the formula needs it) show incomplete energy — not 0 kcal treated as success.
- Analysis table (Russian UI): nutrient or derived expression, ration per 1000 kcal ME, FEDIAF target, status (distinct copy/styling per enum), completeness, source. Derived rows (EPA+DHA, Ca:P, Met+Cys, Phe+Tyr, ω6/ω3) marked calculated. Catalog-only nutrients without a FEDIAF target (e.g. `CH`) are reference-only, not `met`.
- Coverage: if catalog mass coverage of expected atomic targets is below 60%, show an incomplete banner; do not present an overall “ration meets FEDIAF” success. Comment in code that 60% is retained from the prototype pending a documented FEDIAF rule.
- Incomplete states must not look like success: unconfirmed stage, therapeutic gate, unknown feed form for Se/Tau, missing catalog values, missing MER parameters. Loading skeleton while `POST /assessments` is in flight; error message on network/500 failure, never an empty all-met table.
- Clinical disclaimer from `GET /guidelines/active` (`clinical_warning_ru`) is always visible on the analysis surface.
- Manual profile and Patient-backed profile use the same confirm + gate rules. With `patientId` query, prefill from `GET /patients/{id}`; without Patient, species + weight and formula-required fields are entered manually. Non-dog/cat species: show that FEDIAF applies to dogs and cats only; do not run normative comparison.
- Do not dual-run against the deleted TypeScript engine. Do not add NRC/AAFCO selector, complementary-only branch, breed-note callouts, or English UI.
- Do not persist Diet Plan snapshots in this issue (next issue).

## Acceptance Criteria
- Without a Patient: enter adult dog, 20 kg, confirm suggested stage/formula → FEDIAF MER and RER × factor appear; after adding only dry commercial foods with grams, analysis table shows per-1000-kcal rows and `met` / `below_minimum` where mins exist.
- With a Patient: fields prefill; suggestions require Confirm; changing override without Confirm does not send the old suggestion as confirmed.
- Therapeutic-goal checked: no normative pass table; gate copy + disclaimer visible; energy may still show if inputs exist.
- Unconfirmed stage: analysis panel prompts to confirm; no `met` grid.
- Wet-only ration applies wet Se/Tau rules; dry-only applies dry; mixed/unknown shows `insufficient_context` for those rows until override.
- A not-established FEDIAF target renders `not_established`, not 0% of target and not `met`.
- JSON `null` catalog values produce `missing_product_data` (or excluded from `met` counts), never a passed minimum.
- Coverage &lt; 60% shows the incomplete banner. Missing weight: no successful FEDIAF MER.
- Lactation formula without litter size: incomplete energy state.
- Unresolved dog size class when required: visible unresolved state, not a fabricated class.
- `POST /assessments` without bearer → 401. Failed assessment fetch shows error styling, not success.
- UI language is Russian; guideline strings come from imported Russian names.

## Dependencies
- `docs/issues/split-stack-nutrition/split-workbench.md` — FastAPI, auth, Russian Nutrition route, API client.
- `docs/issues/split-stack-nutrition/client-patient.md` — optional Patient prefill (`GET /patients/{id}`).
- `docs/issues/split-stack-nutrition/food-catalog.md` — Foods, nutrient values, `feed_form` on foods, `GET /foods`.
- `docs/issues/split-stack-nutrition/fediaf-postgresql.md` — published edition, canonical nutrients, AST formulas, targets, applicability, `GET /guidelines/active`.
- Assumption: RER factor defaults match common veterinary factors already used in the prototype (`src/lib/nutrition.ts` `calculateRERMER`) copied into FastAPI; clinician can change the factor in the UI.
- Assumption: suggestion confidence is shown as Russian copy (“низкая уверенность”) when age/activity mapping is weak; Confirm remains mandatory.
- Out of this issue: saving a Diet Plan snapshot; assessment history; auto-recompute of saved plans.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/assessments/` (engine, AST interpreters, schemas, router)
- `apps/api/src/vetdietderm_api/guidelines/` (repository load of published snapshot)
- `apps/api/src/vetdietderm_api/catalog/` (ration nutrient aggregation helpers)
- `apps/api/src/vetdietderm_api/main.py`
- `src/app/nutrition/page.tsx`
- `src/components/modules/nutrition.tsx` (replace prototype module)
- `src/lib/nutrition-workspace.ts` (client workspace state: suggestions vs confirmed, feed form override, therapeutic flag, grams)
- `src/lib/api-client.ts`
- `src/lib/hooks.ts`
- `src/lib/nutrition.ts` (do not keep as FEDIAF SoT; RER math may move to API)

## Implementation Steps
- [ ] Step 1: Define Pydantic assessment DTO and `AssessmentStatus` StrEnum in `vetdietderm_api.assessments.schemas`.
- [ ] Step 2: Implement whitelist formula AST and applicability predicate interpreters; reject unknown operators.
- [ ] Step 3: Implement a published-edition repository that loads profiles, formulas, targets, rules, derived expressions, canonical nutrients, and source refs from PostgreSQL only.
- [ ] Step 4: Implement `assess_nutrition` pipeline: validate → confirmed profile → energy → normalize ration to per 1000 kcal ME using catalog `per_100g_as_fed` values → atomic totals → derived expressions → applicability → compare → coverage.
- [ ] Step 5: Add `POST /assessments` and `POST /assessments/suggestions`; wire RER × factor as a secondary field in the energy block.
- [ ] Step 6: Add nutrition workspace client state: manual vs patient profile, suggestion vs confirmed codes, therapeutic flag, ration lines, inferred vs override `feed_form`.
- [ ] Step 7: Prefill from `patientId` via `GET /patients/{id}`; keep the same Confirm controls for manual entry.
- [ ] Step 8: Build ration UI: Food search from `GET /foods`, grams, type-agnostic list, feed-form inference display and override.
- [ ] Step 9: Render analysis table from `POST /assessments` with all statuses, derived badges, source column, 60% coverage banner, disclaimer from `GET /guidelines/active`.
- [ ] Step 10: Gate therapeutic-goal, unconfirmed stage, non-dog/cat, incomplete MER, and assessment HTTP errors as specified (no success styling).
- [ ] Step 11: Stop importing `src/lib/fediaf.ts` and `src/lib/nutrition-analysis.ts` from Nutrition UI components so client-side FEDIAF norm comparison is gone; delete those modules when nothing else imports them.
- [ ] Step 12: Walk with-patient and without-patient adult dog, wet vs dry vs mixed Se/Tau, therapeutic gate, and lactation missing litter size in the browser.

## Verification
- Browser, no patient: dog 20 kg → confirm stage/formula → MER + RER factor visible → add dry foods → table with statuses and disclaimer.
- Browser, patient: prefill, Confirm required, override then confirm changes MER/norms only after Confirm.
- Mixed ration: Se/Tau `insufficient_context`; override dry or wet updates those rows; clear override restores incomplete.
- Therapeutic flag: gate card, no normative pass table.
- Not-established row is labeled as such and excluded from “met” counts.
- Coverage banner when catalog completeness is below 60%.
- `curl` `POST /assessments` without bearer → 401; with unconfirmed/missing profile codes → 422 or DTO without normative `met` rows.
- `npx tsc --noEmit` after the Nutrition UI rewrite.
- Confirm FastAPI assessment handlers do not read `docs/fediaf_2025_veterinary_nutrition_database_ru.json`.
