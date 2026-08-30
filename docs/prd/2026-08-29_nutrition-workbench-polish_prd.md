---
prd_id: 2026-08-29-nutrition-workbench-polish
cycle_id: 2026-08-29-nutrition-workbench-polish
cycle_slug: nutrition-workbench-polish
title: Nutrition Workbench Polish
created: 2026-08-29
filename: docs/prd/2026-08-29_nutrition-workbench-polish_prd.md
project_doc: docs/PROJECT.md
status: draft
scope_type: cycle
source: product-discovery
related_issue_batch: null
---

# PRD: Nutrition Workbench Polish

## Cycle Summary

Roadmap **#4 · Core · ⬜ Planned**. Predecessor: **#3 Split-Stack Nutrition** (🚧 In Progress). **#5 Clinical CRM Pivot** stays in progress in parallel and does not block this cycle.

This cycle makes the already-shipped nutrition workbench usable as a daily window: pick a Patient on `/nutrition`, browse the Food catalog as a category-filtered nutrient table, and always run FEDIAF comparison after confirm. Draft until the PRD is approved (`📋 Defined`).

## Goal

A veterinary nutritionist on the instance can, in one sitting, select (or skip) a Patient from the nutrition screen, inspect Foods in a table of name plus nutrient columns grouped by type, and receive a FEDIAF 2025 nutrient and energy assessment without a therapeutic/non-therapeutic switch that blanks the table.

## Current Project Context

- Split stack is running: Next.js UI, one FastAPI process, PostgreSQL. Catalog, guidelines, assessments, and Diet Plans already exist.
- `/nutrition` opened from the nav is a **manual** animal profile. Patient data prefills only from the patient-card link `?patientId=`. A Patient dropdown exists in the save-plan dialog, too late for the sitting.
- Catalog tab: search + filter by Food `type` (commercial / ingredient / supplement), card list, create/edit dialog. `category` and `subcategory` are stored (eight import buckets; subcategories mostly brands) but are not a browse UI. List API returns at most 50 summaries **without** a nutrient matrix. Imported catalog is thousands of rows (on the order of 3.7k Foods, ~1.9k dry).
- Ration card shows a “Лечебная цель” checkbox. When true, the assessment engine returns gate `therapeutic_goal` and **no** normative rows. Cycle 3 required that gate; this cycle reverses the product rule, not the rest of FEDIAF honesty (null ≠ 0, confirm before norms, species gate).
- Nutrient dictionary already has SPEC categories: `main`, `mineral`, `vitamin`, `amino_acid`, `fatty_acid` (~51 atomic nutrients).

## New Functionality

1. **Patient picker on the nutrition workspace**
   - On the ration/analysis tab, a searchable Patient control (animal name · owner) plus “Без пациента · ручной профиль”.
   - Choosing a Patient updates `?patientId=`, prefills the animal form from the Patient card, and clears unconfirmed FEDIAF context so the clinician must Confirm again.
   - Clearing the Patient returns to a manual profile without requiring a reload from the nav.
   - Deep-link from the patient card keeps working.
   - Saving a Diet Plan uses the Patient currently selected on the workspace (still optional).
   - Animal fields remain editable after prefill (session overrides). This cycle does not write them back to the Patient card.

2. **Catalog category panel**
   - Replace the commercial / ingredient / supplement type filter.
   - Horizontal (or equivalent) panel of Food `category` values present in the database (the eight import labels: сухие корма, влажные корма, лакомства, добавки, белки, углеводы, жиры, клетчатка — plus any later clinician-created categories).
   - Several categories may be active at once. Click a category: select **all** of its subcategories. Click again: clear that category.
   - Hover (desktop) opens the subcategory list for that category so the clinician can pick individual subcategories (mostly brands). First tap on touch opens the same list; a distinct control on the category label still means “all subcategories”.
   - Name search remains. The table stays empty until the clinician selects at least one category **or** enters a name search (assumption: search-only must still find a known SKU).

3. **Catalog table**
   - Table is the only catalog browse layout (card grid removed).
   - Columns: sticky **Название**, then all atomic nutrients of the **active nutrient-type tab**, values on `per_100g_as_fed`.
   - Tabs, one group at a time, in order: Основные (`main`) → Минералы (`mineral`) → Витамины (`vitamin`) → Аминокислоты (`amino_acid`) → Жирные кислоты (`fatty_acid`).
   - Column header shows the nutrient **code** (e.g. `CP`); full Russian name is a hover tooltip.
   - Empty cell = missing data; `0` = known zero. Same honesty rule as the editor.
   - Click a row to open the existing create/edit Food dialog.
   - Pagination or “load more” after a filter; do not dump a full category of ~1900 dry foods in one paint.
   - Sort: click a nutrient column header to sort by that as-fed value (toggle direction); missing values last. Default sort is by name. Sort applies on the server with the current filters, not only the visible page.
   - Create Food remains available.

## Changed Existing Functionality

- Remove the therapeutic-goal checkbox and all copy that presents “лечебная / не лечебная цель” as a mode of the calculator.
- After the clinician confirms profile/formula (dog or cat), **always** run the healthy-animal FEDIAF normative table. Energy, coverage, statuses, disclaimer, feed-form honesty, and unconfirmed-profile / non-dog-cat gates stay.
- Assessment requests from this UI send `therapeutic_goal: false` (or the API ignores the flag). Do not add disease-specific therapeutic profiles.
- Opening an old Diet Plan snapshot that stored `therapeutic_goal: true` still shows that snapshot as saved; a new “Оценить” / “Пересчитать и сохранить” on current rules does not re-apply the gate.
- Catalog UI no longer filters by Food `type`. `type` remains on the record and may still appear as metadata in the editor and on ration lines.
- Catalog list is no longer a 50-item summary-only card grid as the clinician-facing browse; the product requires a filterable matrix list (exact HTTP shape is engineering).

## Product Architecture Impact

- Same app shape: Next.js UI + one FastAPI process + existing PostgreSQL. No new host, no second API process, no per-user roles.
- Catalog read path must support: category and subcategory filters, name search, sort by one nutrient code, paged rows, and as-fed values for the nutrients in the active SPEC group. Today’s `GET /foods` cap-50 summaries are not enough for this surface.
- Distinct category/subcategory values for the panel come from stored Food rows, not from a new taxonomy admin.
- Assessments module: stop using therapeutic goal as a hard skip for dog/cat confirmed assessments. Keep species and unconfirmed-profile skips.
- Non-functional: Russian UI; clinical disclaimer still visible; instance password; catalog size is thousands of Foods — pagination is a product requirement, not an implementation detail to skip.

## Functional Nuances

- Manual profile and Patient-backed profile still share Confirm + honesty rules.
- Prefill from Patient does not auto-Confirm FEDIAF stage/formula.
- Multi-category selection is additive. Clearing the last category (and empty search) returns the empty-state prompt.
- Subcategory flyout is a multi-select within that category; clicking the parent category is the “all brands in this bucket” shortcut.
- Nutrient-type tabs change columns only; they do not reset category selection or sort, except that sort is dropped or rebound if the sorted nutrient is not on the new tab (assumption: if the active sort column is hidden, fall back to name sort).
- Ration builder food search on the analysis tab is unchanged in this cycle (name search to add grams). Category panel is the catalog tab.
- Incomplete catalog coverage, mixed feed form, and missing MER inputs must still not look like a FEDIAF pass.

## Data, Integrations, and Constraints

- PostgreSQL `127.0.0.1:15432`. No new third-party services.
- Food `category` / `subcategory` as already imported; Nutrient SPEC `category` for table tabs.
- Table numbers: stored `per_100g_as_fed` only. No extra catalog columns for calculated ratios.
- Instance password remains the access boundary.

## Out of Scope for This Cycle

- Writing session overrides back to the Patient card
- Disease-specific therapeutic nutrient profiles or a replacement “diet goal” model
- Restoring the commercial / ingredient / supplement browse filter
- Showing all ~51 nutrient columns at once
- Excel/CSV export, column-picker presets, virtualized dump of the full 3.7k catalog
- Changing encounter, schedule, gallery, or communications
- Per-user accounts, English UI, NRC/AAFCO, complementary-only analysis branch
- Assessment history timeline; auto-recompute of saved plans on open

## Open Questions

- Exact page size for the catalog table (product: paginate; number can be an engineering default)
- Whether search-only (no category) should rank exact name matches first — assumed yes if cheap
- How to label empty subcategory (`subcategory` null) in the flyout — assumed a single “Без подкатегории” row
- Whether `therapeutic_goal` stays on the API schema as a no-op for compatibility or is dropped in the same change — engineering, as long as the UI never exposes it and new assessments compare
