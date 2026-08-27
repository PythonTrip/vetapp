---
prd_id: 2026-08-27-fediaf-stronger
cycle_id: 2026-08-27-fediaf-stronger
cycle_slug: fediaf-stronger
title: FEDIAF Stronger
created: 2026-08-27
filename: docs/prd/2026-08-27_fediaf-stronger_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: FEDIAF Stronger

## Cycle Summary

Roadmap **#1 · Core · ⬜ Planned → (on approval) 📋 Defined**. Predecessor: none. This cycle delivers the near-term key product value: a trustworthy FEDIAF 2025 dietetics assistant on top of the existing Nutrition workspace, while carefully removing FEDIAF/NRC legacy paths that undermine a single clinical standard.

## Goal

A veterinary nutritionist can, in one sitting, derive energy needs and compare a ration against FEDIAF 2025 nutrient minimums for a healthy dog or cat—with reproducible source metadata, clinician-confirmed stage selection, explicit incomplete-data and out-of-scope gates—and save that assessment context on a Diet Plan. NRC 2006 and the CSV FEDIAF generation path are removed so the JSON database is the sole guidelines source of truth.

## Current Project Context

- Nutrition workspace already offers catalog, RER/MER, diet builder, and nutrient analysis.
- FEDIAF 2025 is partially wired: CSV → `scripts/generate-fediaf-data.mjs` → `src/lib/fediaf-data.ts`, consumed by `src/lib/fediaf.ts` and analysis UI; default `normStandard` is `fediaf2025`.
- NRC 2006 remains a selectable alternate norm standard.
- Full structured database exists at `docs/fediaf_2025_veterinary_nutrition_database_ru.json` (schema alongside) and includes richer content than the CSV slice: size classes, lactation, footnotes/notes, animal profile fields, disease-scope exclusions.
- App remains single-tenant prototype on Pet / DietPlan / NutritionProduct; CRM pivot is a later roadmap cycle.

## New Functionality

1. **JSON source of truth**
   - Treat the FEDIAF 2025 RU JSON (+ schema) as the only guidelines SoT.
   - Codegen a typed runtime module from JSON (replacement for CSV generation).
   - Surface edition/version, source title/URL, and clinical disclaimer from `database_meta`.

2. **Clinical happy path (with and without patient)**
   - Without patient: manual species, weight, and related parameters → stage/formula → MER → ration vs norms.
   - With patient: prefill from Pet; system **suggests** life stage / energy formula / size class; clinician **confirms** before norms and MER are applied.
   - Support pregnancy, lactation (including litter-related parameters from the database), and dog size-class mapping needed for correct energy/stage selection.

3. **Ration analysis quality bar**
   - Compare diet builder output to FEDIAF norms for the confirmed stage.
   - Show nutrient footnotes / `note_ru` where present.
   - Explicit incomplete-data states: null/NE norms, insufficient ration mass coverage, missing parameters for a selected MER formula.
   - Cite source table/page when available in generated data.

4. **Out-of-scope gate**
   - If the workflow indicates disease-specific or therapeutic diet goals, block presenting FEDIAF values as applicable targets and show a clear “outside FEDIAF 2025 scope” state (healthy-animals guideline only).

5. **Diet Plan persistence**
   - When saving a plan from Nutrition, store FEDIAF version/edition, confirmed stage code, and disclaimer (or equivalent metadata) with the plan so the assessment remains reproducible later.

6. **Legacy removal (careful)**
   - Remove CSV-based FEDIAF generation pipeline and stop treating `docs/fediaf_2025_*.csv` as runtime SoT.
   - Remove NRC 2006 as a norm standard from types, workspace state, analysis, and Nutrition UI.
   - Keep RER × factor as a secondary energy cross-check beside FEDIAF MER.
   - Do not casually delete unrelated “legacy” UI (e.g. translation boundary) or archival xlsx unless separately decided.

## Changed Existing Functionality

- Nutrition norm selector becomes FEDIAF-only (no NRC toggle).
- FEDIAF data access layer reads the new JSON-derived module; stage lists, norms, and energy formulas must stay aligned with database codes and Russian labels.
- RER/MER panel continues to show RER × factor, but FEDIAF MER (with ranges when present) is the primary guideline-backed estimate when parameters allow.
- Diet Plan save path gains FEDIAF metadata fields without requiring Encounter/Calculation entities from the CRM pivot.

## Product Architecture Impact

- Guidelines packaging: versioned JSON in repo → build-time codegen → typed module (same operational shape as today’s `fediaf-data.ts`, different SoT).
- No requirement in this cycle to normalize FEDIAF into Postgres tables.
- Remains on current Pet / DietPlan model; does not introduce Workspace auth or Encounter-linked Calculation.
- Product behavior must honor database scope: healthy dogs/cats; no fabricated disease nutrient profiles.

## Functional Nuances

- Roles: single-user prototype; no new permissions model.
- Stage inference is never silent-apply: always confirmable suggestion.
- Manual override of stage/formula always available.
- Null FEDIAF values mean “not established,” not zero.
- Complementary vs complete: no dedicated complementary analysis branch; complete-feed norms remain the orientation with disclaimer.
- i18n: keep existing app locale switching; FEDIAF guideline strings come from the RU database content.
- Failure states: missing weight, unresolved size class, incomplete lactation inputs, low catalog nutrient coverage—each must be visible, not implied success.

## Data, Integrations, and Constraints

- Inputs: Pet fields and/or manual animal profile fields listed in the JSON `data_model.animal_profile_fields` (subset required per formula).
- SoT files: `docs/fediaf_2025_veterinary_nutrition_database_ru.json`, `docs/fediaf_2025_veterinary_nutrition_schema.json`.
- External reference: FEDIAF PDF URL from `database_meta.source`.
- Product nutrient totals still come from `NutritionProduct` catalog aggregation.
- Expression language for formulas: mathjs-compatible per database meta.
- Compliance posture: informational recommendations only; show clinical warning from database meta on analysis and saved plans.

## Out of Scope for This Cycle

- Full CRM pivot (Client/Patient/Encounter, auth, roles, audit)
- Dedicated `Calculation` entity bound to consultations/encounters
- Owner-facing FEDIAF reports via share portal
- Standalone FEDIAF browse/search knowledge hub
- Therapeutic / disease-specific nutrient target databases
- Removing or redesigning dermatology, knowledge, or scheduling modules
- Mandatory deletion of archival xlsx
- Billing, multi-tenant workspaces, offline mode

## Open Questions

- Exact DietPlan JSON (or column) shape for FEDIAF version/stage/disclaimer — decide in implementation
- Whether CSV/xlsx files remain in `docs/` as archives after cutover or are removed in a cleanup pass
- How strongly the UI should detect “therapeutic goal” (explicit clinician flag vs heuristic from consultation specialty/diagnoses)
- Mapping rules from existing Pet `lifeStage` / activity enums onto FEDIAF stage codes when suggestion confidence is low
