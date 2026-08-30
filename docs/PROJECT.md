---
project_id: vetdietderm
title: VetDietDerm
updated: 2026-08-29
source: product-discovery
---

# Project: VetDietDerm

## Project Description

VetDietDerm is a veterinary clinical workbench for specialists who manage patients, consultations, and follow-up. The first focus segments are veterinary dermatologists and nutritionists. The product does not replace clinical judgment: calculators and guidance must show sources, versions, and leave the final decision to the clinician.

## Target Users

- Private-practice veterinary nutritionists and dermatologists
- Small specialty clinics and cabinets
- Assistants and admins who schedule visits and owner communications (later CRM depth)

Primary user for the active nutrition cycle: the veterinary nutritionist on a local or VPS instance.

## Business Model

B2B software for private specialists and small clinics (assumption from current product direction). Monetization details are not fixed.

## Product Vision

Become the primary work window across the treatment cycle: client and patient → scheduled encounter → structured clinical record → reproducible calculations and diet plans → follow-up. Dermatology and nutrition are specialization packs on a shared clinical core, not separate apps.

Near-term product emphasis: a trustworthy FEDIAF 2025 dietetics assistant on a split stack (Next.js UI, FastAPI API, PostgreSQL). Guideline and catalog data are versioned in the database. The application does not use JSON files or generated TypeScript guideline modules at runtime.

The nutrition workbench lets the clinician start from a real Patient (or a manual profile), browse the Food catalog as a nutrient table, and assess a ration against FEDIAF for dogs and cats. Energy need and nutrient norms are independent clinical questions, joined only by animal-context compatibility — not by an application-owned `energy_formula → nutrient_profile` pair. The clinician works a scenario (animal, energy method, nutrient standard, ration), not internal database objects. Disease-specific therapeutic nutrient profiles remain a later specialization, not a hidden switch that blanks the current analysis.

The rebuild laid a foundation for CRM and specialty packs: separate Client and Patient, modular API bounded contexts, one FastAPI process that can be split later. Clinical encounters, templates, attachments, appointments, and communications now sit on that core.

## Current Functionality

Shipped runtime is the **split stack**: Next.js UI in `frontend/`, one FastAPI process in `apps/api/`, PostgreSQL at `127.0.0.1:15432`, instance password. Prisma and Next.js Route Handlers are not in runtime.

- Client and Patient as separate entities; search, create, edit; patient card fields include allergies, chronic conditions, and feeding notes
- Encounters on the patient card and `/encounter`: specialty (dermatology / nutrition / general), SOAP, structured anamnesis, VAS 1–10, statuses draft / in progress / completed
- Encounter templates for anamnesis, exam, and plan; scopes `standard` (read-only), `clinic`, and `doctor`
- Dermatology gallery: lesion photos and PDFs stored on disk (`ATTACHMENT_DIR`), metadata and VAS in PostgreSQL, optional link to an encounter
- Schedule (`/schedule`): day list of appointments with visit type and status, create / reschedule / cancel, deep-link to the patient card
- Communication log on the patient card (channel, direction, follow-up time)
- Nutrition workspace (`/nutrition`) tabs: **Рацион и анализ**, **Недавние планы**, **Каталог Foods**
- Patient picker on the ration tab: search by animal or owner, or stay on «Без пациента · ручной профиль»; `?patientId=` from the patient card still prefills; Patient remains optional on save
- Food catalog: category/subcategory panel (eight import buckets; subcategories mostly brands), paged as-fed nutrient matrix by SPEC group, server sorting, 50-row load-more, name search; empty until a category or search is set
- Ration builder; honest FEDIAF 2025 assessment from PostgreSQL guidelines; replace-on-save Diet Plan snapshot
- Confirmed dog/cat assessments always run the healthy-animal FEDIAF comparison; **shipped runtime still requires a paired nutrient profile and MER formula** (mismatched pair → 422). `therapeutic_goal` remains an ignored compatibility field; historical gated Diet Plan snapshots stay stored as saved
- Food rows have no species compatibility; ration search does not filter cat-only commercial foods away from a dog patient
- Energy ranges from range-only formulas currently collapse the primary MER to the lower bound
- Russian UI, theme toggle, instance lock screen

Not shipped: Food `species_compatibility` (dropped from cycle #6), users/roles, owner share portal, knowledge/AI handouts, drug checker, English UI, Prisma data migration, S3, dose/fluids calculators.

## Product Cycle Roadmap

| # | Status | Stage | Cycle | Product Outcome | PRD / Issues |
| --- | --- | --- | --- | --- | --- |
| 1 | ✅ Done | Core | FEDIAF Stronger | Nutritionist can run a confirmed FEDIAF 2025 happy path on the prototype (JSON SoT, stage confirm, therapeutic gate, Diet Plan `fediafMeta`); NRC/CSV runtime removed. Quality bar was not shipped. | [PRD](prd/2026-08-27_fediaf-stronger_prd.md) · [issues](issues/fediaf-stronger/) |
| 2 | ❌ Cancelled | Core | FEDIAF Relational Assessment | Trustworthy Postgres-backed ration analysis on the Next/Prisma prototype. Cancelled: same clinical outcome is delivered on a new stack in cycle 3; in-place Prisma refactor was rejected. | [PRD](prd/2026-08-28_fediaf-relational-assessment_prd.md) |
| 3 | ✅ Done | Core | Split-Stack Nutrition | Nutritionist uses a rebuilt workbench (Next.js UI + one FastAPI process + existing PostgreSQL): Client/Patient, Food catalog, ration, honest FEDIAF 2025 assessment, reproducible saved plan. Legacy prototype modules left runtime. Therapeutic-goal gate from this cycle was later removed in #4. | [PRD](prd/2026-08-28_split-stack-nutrition_prd.md) · [issues](issues/split-stack-nutrition/) |
| 4 | ✅ Done | Core | Nutrition Workbench Polish | Nutritionist picks a Patient on `/nutrition`, browses Foods as a category-filtered nutrient table, and always gets a FEDIAF comparison after confirm — no therapeutic-goal switch. Confirmed profile and MER formula are strictly paired (to be removed in #6). | [PRD](prd/2026-08-29_nutrition-workbench-polish_prd.md) · [issues](issues/nutrition-workbench-polish/) |
| 5 | 🚧 In Progress | Core | Clinical CRM Pivot | Client/Patient/Encounter workspace with schedule, attachments, communications, and encounter templates on the split stack. Users/roles and encounter-stored calculations are still later. | — |
| 6 | 🚧 In Progress | Core | Nutrition Context Split | Clinician assesses energy and nutrient norms as independent FEDIAF scenarios; ranges stay ranges; stale results cannot look valid; adult minima come from Table VII-11 daily amounts, not fake MER75/100 or MER95/110 pairs. | [PRD](prd/2026-08-29_nutrition-context-split_prd.md) |
| 7 | ⬜ Planned | Pro | Specialty Depth | Stronger derm/nutrition encounter templates, follow-up CRM, additional clinical calculators (dose, fluids), and disease-specific therapeutic nutrient profiles if still wanted | — |
| 8 | ⬜ Planned | Platform | Pilot Hardening | Audit, backups depth, medical-data protections, and multi-user clinic readiness on VPS | — |

## Product Architecture

- **Web:** Next.js + TypeScript + Tailwind in `frontend/` — UI only. No Next.js Route Handlers as the product backend; no Prisma in the rebuilt runtime. Clinical calculations are not duplicated in React.
- **API:** one FastAPI process (Pydantic contracts) with internal bounded contexts (`patients`, `encounters`, `encounter_templates`, `attachments`, `appointments`, `communications`, `catalog`, `guidelines`, `assessments`). Module boundaries are the foundation for later extraction; this cycle does not run multiple API processes.
- **Data:** existing PostgreSQL at `127.0.0.1:15432` (local and the already-provisioned VPS instance). No Vercel, no Neon. No Docker Compose / orchestration as a cycle deliverable.
- **Access:** single instance password (not per-user roles).
- **Core entities:** Client (owner), Patient (animal), Encounter, EncounterTemplate, Appointment, Attachment (disk + metadata), Communication, Food (commercial / ingredient / supplement stored, but catalog browse is by import `category` / `subcategory`), Nutrient and `food_nutrient_values` (see `docs/Nutrient.md`), FEDIAF guideline edition data in PostgreSQL, Diet Plan with a replaced-on-save assessment snapshot.
- **Nutrition analysis model (accepted direction, cycle #6):** Animal Context independently selects an Energy Scenario (kcal/day or range) and a Nutrient Standard (minima / maxima / ratios). Ration actuals are compared to the standard. Compatibility is species + physiological context + required fields — not `energy_formula.profile_id`. Adult minima use FEDIAF Table VII-11 daily amounts per metabolic BW. Growth and reproduction use published life-stage concentration tables, still without formula ownership. Published adult density columns (MER 95/110, 75/100) are archival reference, not the primary adult verdict.
- **Later entities:** User/Role, signed encounter, S3 object store, specialty calculators. They must attach to Client/Patient without collapsing owner back into Patient.
- Disease-specific therapeutic profiles are not a product mode. Species other than dog/cat still skip normative comparison.

## Data, Integrations, and Constraints

- Operational source of truth after the rebuild: PostgreSQL only.
- Catalog and nutrient values: 51 atomic nutrients seeded in migration `0003_food_catalog` (`main`, `mineral`, `vitamin`, `amino_acid`, `fatty_acid`); `NULL` ≠ 0; preferred stored basis `per_100g_as_fed`; derived ratios calculated; optional `source_uuid`. Inventory and runtime semantics: `docs/Nutrient.md`.
- Food `category` / `subcategory` come from catalog import (`type` / `subcat` in `products_normalized.json`). Categories are the eight import buckets; subcategories are mostly brands.
- Import artifacts (CLI only, never read by the running UI or API): `docs/data/products_normalized.json` (catalog) and `docs/data/fediaf_2025_veterinary_nutrition_database_ru.json` (+ schema). Cycle #6 adds Table VII-11 adult daily amounts to that JSON SoT. Clinician can also create/edit Food in the UI.
- External reference: FEDIAF Nutritional Guidelines PDF (edition metadata, currently `2025.09`), including Table VII-11 for adult daily minima and life-stage concentration tables (III-3 / III-4 / VII-17 / VII-18) for growth, reproduction, and archival adult densities.
- Archival only: `docs/data/fediaf_2025_*.csv`, `docs/data/fediaf_2025_veterinary_nutrition_ru.xlsx`. Table VII-11 is not in those files today.
- Clinical outputs remain informational with an explicit disclaimer (`GET /guidelines/active` `clinical_warning_ru`).
- UI language this cycle: Russian. FEDIAF import content is Russian.
- Guideline import/publish remains operator CLI, not an unauthenticated public API.

## Known Decisions

- Full rebuild is authorized; unused prototype modules may be deleted rather than migrated.
- No migration of existing Pet/Consultation/DietPlan/Prisma rows. Catalog and guidelines are imported fresh into PostgreSQL.
- Split-Stack Nutrition (#3) and Nutrition Workbench Polish (#4) are closed. Clinical CRM Pivot (#5) remains in progress. **Nutrition Context Split (#6) proceeds in parallel with #5** (same explicit exception as #4 vs CRM). Cycle 2 is cancelled, not deferred.
- Happy path works with and without a saved Patient; a Diet Plan may be saved without a Patient. The nutrition workspace offers a searchable Patient picker (animal and owner), plus the `?patientId=` deep-link and the save dialog.
- Selecting a Patient prefills the animal form for this sitting. Fields stay editable as session overrides. Nutrition-session overrides (including `target_body_weight_kg`) are not written back to the Patient card in the current or #6 cycle.
- Client and Patient are separate; owner is not embedded on the animal row.
- One Food catalog. Clinician browse is a category panel (`category` + `subcategory`), not a commercial / ingredient / supplement type filter. Stored `type` remains on the Food row for import and ration metadata.
- Catalog table is the primary catalog view: sticky food name, nutrient columns by group (tabs: main, mineral, vitamin, amino_acid, fatty_acid), values on `per_100g_as_fed`. Empty catalog table until the clinician selects a category or searches by name. Page size 50 with load-more. Sort by one nutrient column, missing values last.
- Category panel: several categories may be active. Hover (desktop) or first tap (touch) opens subcategories. Clicking a category selects all of its subcategories; clicking again clears that category.
- Energy-method and nutrient-standard inference is suggestion-only. Suggestions never become confirmed without explicit Apply. Energy estimate may show a live «Предложено» preview; nutrient verdict does not run on preview state.
- **Rejected application invariant:** an energy formula does not own exactly one nutrient profile. Exact-pair 422 is not a FEDIAF rule and will be removed in #6. Compatibility 422 remains for species mismatch, invalid physiological context, and missing required fields (for example growth formula without current weight or expected mature weight; lactation without week / litter size).
- Adult dog `125 kcal × BW^0.75` with the adult VII-11 nutrient standard is allowed. Dog growth 8 weeks–1 year with early-growth or late-growth nutrient standards is allowed.
- Adult clinical minima come from Table VII-11 (`required_daily = VII-11 × metabolic BW` vs `actual_daily`). Working kcal are not part of that comparison. `daily_min × 1000 / working_kcal` is a UI equivalent labelled as calculated density for the current energy target, not as a published FEDIAF profile. No `scales_with_working_energy` flag on VII-11 rows. Published concentration tables (III-3 / III-4 / VII-17 / VII-18), including adult MER 95/110 and 75/100 columns, are a separate archival/reference entity and are not the primary adult verdict. Example: adult dog fat minimum at MER 95 was intentionally not adjusted relative to MER 110 — that fact lives in the concentration tables, not in VII-11.
- Growth and reproduction nutrient assessment uses the matching FEDIAF life-stage concentration table (`target_per_1000_kcal`). Daily equivalent may be derived as `target × working_energy_target / 1000`. That is arithmetic, not database ownership.
- `current_body_weight_kg`, `target_body_weight_kg`, and `expected_mature_weight_kg` are distinct. FEDIAF formulas default to current BW; target BW is an explicit clinician override stored on the session and Diet Plan snapshot. Expected mature weight is for dog growth (`actual / expected mature`), not “ideal weight”.
- Dog size class is derived on the server from `expected_mature_weight_kg`; the primary UI does not show it. Manual override lives under advanced settings.
- Energy formulas that return a range must return a range. The UI does not silently use min, max, or midpoint as `working_energy_target`. For a point formula, Apply of the method sets the working target to that point (overridable). Full nutrient assessment requires confirmed energy method, confirmed nutrient standard, and a working target when the energy result is a range (and for point, after Apply, the point is that target).
- Kitten (and any `k × MER`) formulas take a separate confirmed **base MER** context: an adult energy method plus a chosen point. Base MER is not the indoor lower bound and not the kitten ration’s working target. Until that point exists, the kitten card reports missing MER rather than a fake kcal figure. If the multiplier is a range, the kitten result is a range; ration working target stays empty until chosen.
- RER × factor remains a secondary energy cross-check and must not share visual weight with the primary FEDIAF energy result.
- No therapeutic-goal control in the UI. After confirmed energy method and nutrient standard, dog/cat rations receive the healthy-animal FEDIAF comparison. Unconfirmed context and non-dog/cat species still skip norms. Disease-specific therapeutic profiles stay later.
- `feedForm`: infer when the ration is uniformly wet or dry; mixed/unknown → insufficient data for form-dependent targets; clinician may override.
- Canonical nutrient is atomic; composites (EPA+DHA, Ca:P, Met+Cys, Phe+Tyr, ω6/ω3, /DM, /ME) are calculated, not stored as nutrients, and are not extra catalog-table columns.
- Null / not-established is never treated as zero and never counted as a met minimum. Legal maxima stay out of the clinical ration verdict (Nutrition Trust Reset behavior preserved). Nutritional maxima remain separate concentration constraints.
- One assessment snapshot per Diet Plan save (replaced on the next save). Old snapshots (paired profile/formula, `therapeutic_goal: true`) stay as saved history and are not remapped. A new assess/save uses current rules.
- Food `species_compatibility`, species-filtered search, and ration-level mismatch confirmation are **out of cycle #6**. Catalog and ration Add remain name/category search without a species gate.
- Breed notes, complementary-only analysis branch, NRC/AAFCO, knowledge/AI, share portal, drug checker, English UI, per-user roles, and Docker/Vercel/Neon remain later. Encounters, templates, derm gallery, schedule, and communications sit on the split stack (roadmap #5 in progress) without Prisma or Next API routes.
- Lesion originals live on disk (`ATTACHMENT_DIR`); PostgreSQL stores attachment metadata only. No base64 in the primary tables.
- Multiple API processes are deferred; keep extractable modules in one process.

## Cycle History

- 2026-08-27 — Product discovery established `docs/PROJECT.md` and drafted cycle 1 PRD for FEDIAF Stronger; executable issues created under `docs/issues/fediaf-stronger/`.
- 2026-08-27 — FEDIAF Stronger implementation advanced: JSON SoT codegen, clinical happy path, out-of-scope gate, DietPlan `fediafMeta` persistence, and legacy NRC/CSV runtime removal marked Done. Remaining issue at that time: ration-analysis quality bar.
- 2026-08-28 — Product discovery closed cycle 1 as ✅ Done with reduced scope. Cycle 2 **FEDIAF Relational Assessment** drafted for an in-place Prisma guideline cutover.
- 2026-08-28 — Product discovery **cancelled cycle 2** and registered Core cycle **Split-Stack Nutrition** (#3). Direction: split Next.js / FastAPI, existing PostgreSQL (`127.0.0.1:15432`), Nutrient SPEC catalog, FEDIAF assessment in Postgres, greenfield import, delete unused prototype runtime. Clinical CRM Pivot moved to #4; Specialty Depth #5; Pilot Hardening #6 (VPS, not Vercel/Neon).
- 2026-08-29 — Clinical CRM slice restored on the split stack: Encounter + structured anamnesis/VAS, disk-backed attachments, appointments, communications, then encounter templates (`standard` / `clinic` / `doctor`). That CRM cycle is now roadmap #5 (still 🚧 In Progress). Users/roles and encounter-stored calculations still open. No Prisma row migration.
- 2026-08-29 — Product discovery registered Core cycle **Nutrition Workbench Polish** as roadmap #4 (inserted before CRM): in-workspace Patient picker, category/subcategory catalog table, remove therapeutic-goal gate and control.
- 2026-08-29 — Cycle #4 issues closed: Patient picker, catalog category panel, paged as-fed catalog table, always-run FEDIAF. Cycle #3 treated as Done; remaining `dietetics-happy-path` issue file is stale after the therapeutic-goal reversal.
- 2026-08-29 — Confirmed FEDIAF nutrient profile and MER formula were strictly paired in suggestions, UI, and assessment 422 (cycle #4 close-out). That pairing is an application assumption, not a FEDIAF requirement.
- 2026-08-29 — Product discovery registered Core cycle **Nutrition Context Split** as roadmap #6, in parallel with CRM #5. Direction: decouple Energy Scenario from Nutrient Standard; import Table VII-11 for adult daily minima; clinician UI around scenario not engine objects. Specialty Depth → #7; Pilot Hardening → #8.
- 2026-08-30 — Cycle #6 dropped Food `species_compatibility`, species-filtered search, and ration-level mismatch confirmation. They remain later; this cycle does not add a species gate on the ration Add dialog.

## Open Product Questions

- Concrete B2B pricing and packaging
- Whether archival CSV/XLSX under `docs/data/` should later be deleted or kept as source archives
- Whether complementary-food scenarios eventually need a dedicated analysis path
- What `source_uuid` on food nutrient values represents in product terms (label, lab, import batch) and whether Source has a clinician UI later
- Mapping confidence from Patient life stage / activity onto energy-method and nutrient-standard suggestions when confidence is low
- When to extract FastAPI modules into separate processes
- Whether English UI returns as a later cycle or stays Russian-only
- Whether a later cycle writes nutrition-session overrides (including target body weight) back onto the Patient card
- Whether to restore a standalone Nutrient SPEC document; current inventory lives in `docs/Nutrient.md` and migration `0003_food_catalog`
- CLI import paths (`products_normalized.json` at repo root; FEDIAF JSON under `docs/`) versus the current files under `docs/data/`
- Whether a later cycle adds Food `species_compatibility` and species-filtered ration search
- Whether archival adult density standards (`dog_adult_density_95/110`, `cat_adult_density_75/100`) later get a clinician cross-check surface, or stay data-only
