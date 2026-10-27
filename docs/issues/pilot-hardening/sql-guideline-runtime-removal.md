---
source_prd: docs/prd/2026-10-27_pilot-hardening_prd.md
prd_id: 2026-10-27-pilot-hardening
cycle_id: 2026-10-27-pilot-hardening
cycle_slug: pilot-hardening
project_doc: docs/PROJECT.md
status: Done
---

# SQL Guideline Runtime Removal

## Implementation Status
Status: Done

## Description
The blocked SQL FEDIAF import and publish commands leave the API process. Clinician calculations stay on the in-process FEDIAF 2025 provider. Archived tables and leftover public guideline metadata stay in PostgreSQL. Saved plans, encounter text, ownerless rows, the food catalog, and gallery files keep their current read behavior.

## Requirements
- Delete these modules, which exist only to import, publish, or guard the archived SQL runtime:
  - `apps/api/src/vetdietderm_api/guidelines/import_fediaf.py`
  - `apps/api/src/vetdietderm_api/guidelines/publish_fediaf.py`
  - `apps/api/src/vetdietderm_api/guidelines/legacy_repository.py`
  - `apps/api/src/vetdietderm_api/guidelines/legacy_models.py`
  - `apps/api/src/vetdietderm_api/guidelines/legacy_guard.py`
- Keep `apps/api/src/vetdietderm_api/guidelines/models.py`, `router.py`, `schemas.py`, and `__init__.py`. `GuidelineStandard` and `GuidelineEdition` remain mapped to `guideline_standards` and `guideline_editions`.
- Update the `models.py` module docstring so it no longer says the archived mappings live in `legacy_models`.
- Remove `test_legacy_sql_commands_fail_clearly_after_archive` from `apps/api/tests/guidelines/test_provider_persistence_boundary.py`. Keep `test_runtime_normative_tables_are_not_part_of_application_metadata`.
- Rewrite the operator pipeline in `docs/Nutrient.md` section "Data sources". State that normative values load from `vetdietderm_api.standards.fediaf.v2025`, that `docs/data/fediaf_2025_veterinary_nutrition_database_ru.json` is an archive, and that the API does not import or publish SQL guideline rows. Remove the sentence that says the running engine loads a published edition from PostgreSQL.
- In `docs/PROJECT.md`, replace the Data table row that names `vetdietderm_api.guidelines.import_fediaf` / `publish_fediaf` as operator CLIs. State that those commands are not in the API process and that schema `legacy_guidelines` remains.
- Do not drop schema `legacy_guidelines`, `guideline_standards`, or `guideline_editions`. Do not add an Alembic migration.
- Do not edit diet-plan read mapping, encounter document reading, `tenancy.py`, catalog import, or attachment storage.
- Do not remove `vetdietderm_api.catalog.import_products`.

## Acceptance Criteria
- `import vetdietderm_api.guidelines.import_fediaf` and `import vetdietderm_api.guidelines.publish_fediaf` fail because the modules are gone.
- `GET /guidelines/active` still returns the in-process provider metadata through `vetdietderm_api.guidelines.router`.
- `Base.metadata` still does not contain `guideline_profiles`, `energy_formulas`, or `guideline_targets`, and still contains `guideline_standards` and `guideline_editions`.
- `docs/Nutrient.md` and `docs/PROJECT.md` no longer tell an operator to run `import_fediaf` or `publish_fediaf`.
- A stored diet plan whose snapshot has no `provider_version` still reads as `legacy/sql` without recalculation. An encounter without structured `documents` still opens from stored `anamnesis` / `exam` text. A row with null `tenant_id` and null `created_by` stays inaccessible.

## Dependencies
- None. Schema `legacy_guidelines` and the in-process provider already exist. This issue does not wait on the readiness issues.

## Files Likely Touched
- `apps/api/src/vetdietderm_api/guidelines/import_fediaf.py`
- `apps/api/src/vetdietderm_api/guidelines/publish_fediaf.py`
- `apps/api/src/vetdietderm_api/guidelines/legacy_repository.py`
- `apps/api/src/vetdietderm_api/guidelines/legacy_models.py`
- `apps/api/src/vetdietderm_api/guidelines/legacy_guard.py`
- `apps/api/src/vetdietderm_api/guidelines/models.py`
- `apps/api/tests/guidelines/test_provider_persistence_boundary.py`
- `docs/Nutrient.md`
- `docs/PROJECT.md`

## Implementation Steps
- [x] Step 1: Delete the five legacy guideline modules listed in Requirements.
- [x] Step 2: Edit the `models.py` docstring so the remaining classes are described as leftover public metadata, not as a pair to `legacy_models`.
- [x] Step 3: Delete `test_legacy_sql_commands_fail_clearly_after_archive` and its `legacy_guard` imports. Keep the metadata disjoint/subset test.
- [x] Step 4: Replace the SQL import/publish operator instructions in `docs/Nutrient.md` and the matching CLI row in `docs/PROJECT.md`.
- [x] Step 5: Search `apps/api` and `docs` for `import_fediaf`, `publish_fediaf`, `legacy_guard`, `legacy_repository`, and `legacy_models`. Update or remove each remaining operator instruction. Leave Alembic revision files that only record history.
- [x] Step 6: Run the checks in Verification.

## Verification
- `uv run --project apps/api python -c "import vetdietderm_api.guidelines.import_fediaf"` exits non-zero.
- `uv run --project apps/api python -c "import vetdietderm_api.guidelines.router"` exits zero.
- `uv run --project apps/api pytest apps/api/tests/guidelines/test_provider_persistence_boundary.py -q` passes.
- Search `docs/Nutrient.md` and `docs/PROJECT.md` and confirm neither file contains `import_fediaf` or `publish_fediaf`.
- Open one saved diet plan that has no `provider_version` and confirm the read model still reports `legacy/sql` and does not recalculate. Open one encounter that has text `anamnesis` and no `documents` and confirm the stored text is still shown.
